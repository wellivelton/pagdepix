import * as https from 'https';

interface IpInfoResult {
  city?: string;
  country?: string;
  isVpn: boolean;
}

// Utilitário simples para buscar localização e VPN de um IP usando API externa.
// Por padrão usa o serviço ipapi.co sem chave (rate limitado) apenas para cidade/país
// e não detecta VPN. Se você tiver um serviço específico de VPN (ex: ipdata, ipqualityscore),
// configure via variáveis de ambiente.
export async function getIpInfo(ip: string | undefined): Promise<IpInfoResult> {
  const fallback: IpInfoResult = { isVpn: false };

  if (!ip || ip === 'unknown' || ip === '::1') {
    return fallback;
  }

  try {
    const vpnApiUrl = process.env.VPN_API_URL;
    const vpnApiKey = process.env.VPN_API_KEY;

    // Caso tenha um serviço especializado de VPN configurado
    if (vpnApiUrl && vpnApiKey) {
      const url = `${vpnApiUrl}?ip=${encodeURIComponent(ip)}&key=${encodeURIComponent(
        vpnApiKey
      )}`;

      const data = await httpGetJson<any>(url);

      // Aqui você adapta de acordo com o provedor que escolher.
      // Exemplos de campos comuns: is_vpn, proxy, hosting, etc.
      const city = data.city || data.city_name || undefined;
      const country = data.country || data.country_name || data.country_code || undefined;
      const isVpn =
        data.is_vpn === true ||
        data.vpn === true ||
        data.proxy === true ||
        data.hosting === true ||
        false;

      return {
        city,
        country,
        isVpn,
      };
    }

    // Fallback gratuito simples (sem VPN) usando ipapi.co
    const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
    const data = await httpGetJson<any>(url);

    return {
      city: data.city,
      country: data.country_name || data.country,
      isVpn: false,
    };
  } catch (error) {
    console.error('Erro ao buscar informações de IP:', error);
    return fallback;
  }
}

function httpGetJson<T = any>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

