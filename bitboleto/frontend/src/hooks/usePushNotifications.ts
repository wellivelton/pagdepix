import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

async function registerSubscription(sub: PushSubscription): Promise<void> {
  const key = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  if (!key || !auth) throw new Error('Chaves de subscription inválidas');

  const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)));
  const authStr = btoa(String.fromCharCode(...new Uint8Array(auth)));

  await api.post('/push/subscribe', {
    endpoint: sub.endpoint,
    keys: { p256dh, auth: authStr },
  });
}

// Envia o token JWT ao SW para que ele possa renovar a subscription sem interação
function syncTokenToSW(reg: ServiceWorkerRegistration): void {
  const token = localStorage.getItem('token');
  if (!token) return;
  const sw = reg.active ?? reg.waiting ?? reg.installing;
  if (sw) {
    sw.postMessage({ type: 'SET_TOKEN', token });
  } else {
    // SW ainda não ativado — aguarda e tenta novamente
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const active = navigator.serviceWorker.controller;
      if (active) active.postMessage({ type: 'SET_TOKEN', token });
    }, { once: true });
  }
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  // VAPID key cacheada no mount — evita fetch assíncrono durante requestPermission()
  const vapidKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported');
      return;
    }

    const currentPerm = Notification.permission as PermissionState;
    setPermission(currentPerm);
    api.post('/push/permission-status', { status: currentPerm }).catch(() => {});

    // Buscar VAPID key antecipadamente — sem bloqueio de gesto
    api.get('/push/vapid-key')
      .then(({ data }) => { vapidKeyRef.current = data.publicKey ?? null; })
      .catch(() => {});

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        setSwRegistration(reg);
        // Sincronizar token JWT ao SW para renovação automática de subscription
        syncTokenToSW(reg);
        return reg.pushManager.getSubscription();
      })
      .then((sub) => {
        setIsSubscribed(Boolean(sub));
      })
      .catch((err) => {
        console.error('[Push] Erro ao registrar SW:', err);
      });
  }, []);

  /**
   * Solicita permissão e inscreve o dispositivo.
   * VAPID key já está em cache — requestPermission() é chamado imediatamente
   * após o clique, sem await de rede intermediário (necessário para Safari/iOS).
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!swRegistration) return false;
    if (permission === 'denied') return false;

    const vapidKey = vapidKeyRef.current;
    if (!vapidKey) return false;

    try {
      // requestPermission() chamado direto — sem await de rede antes
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      api.post('/push/permission-status', { status: perm }).catch(() => {});
      if (perm !== 'granted') return false;

      const existingSub = await swRegistration.pushManager.getSubscription();
      if (existingSub) {
        await registerSubscription(existingSub);
        setIsSubscribed(true);
        return true;
      }

      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await registerSubscription(sub);
      setIsSubscribed(true);

      // Sincronizar token ao SW após nova subscription
      syncTokenToSW(swRegistration);
      return true;
    } catch (err) {
      console.error('[Push] Erro ao inscrever:', err);
      return false;
    }
  }, [swRegistration, permission]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swRegistration) return;
    const sub = await swRegistration.pushManager.getSubscription();
    if (!sub) return;

    await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
    setIsSubscribed(false);
  }, [swRegistration]);

  return { permission, isSubscribed, subscribe, unsubscribe };
}
