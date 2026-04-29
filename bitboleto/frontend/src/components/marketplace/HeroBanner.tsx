import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

interface Banner {
  id: string;
  desktopImageUrl: string;
  desktopLinkType: string;
  desktopLinkTarget?: string;
  mobileImageUrl: string;
  mobileLinkType: string;
  mobileLinkTarget?: string;
}

export function HeroBanner() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    api.get('/marketplace/banners')
      .then(({ data }) => {
        const filtered = (Array.isArray(data) ? data : [])
          .filter((b: any) => b.isActive)
          .sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0))
          .map((b: any) => ({
            id: b.id,
            desktopImageUrl: b.desktopImageUrl,
            desktopLinkType: b.desktopLinkType || 'none',
            desktopLinkTarget: b.desktopLinkTarget,
            mobileImageUrl: b.mobileImageUrl || b.desktopImageUrl,
            mobileLinkType: b.mobileLinkType || 'none',
            mobileLinkTarget: b.mobileLinkTarget,
          }));
        setBanners(filtered);
      })
      .catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const handleBannerClick = () => {
    const banner = banners[currentIndex];
    if (!banner) return;
    const linkType = isMobile ? banner.mobileLinkType : banner.desktopLinkType;
    const linkTarget = isMobile ? banner.mobileLinkTarget : banner.desktopLinkTarget;
    if (linkType === 'none' || !linkTarget) return;
    if (linkType === 'internal') navigate(`/loja/produto/${linkTarget}`);
    else if (linkType === 'external') window.open(linkTarget, '_blank');
  };

  if (banners.length === 0) return null;

  const banner = banners[currentIndex];
  const imageUrl = isMobile ? banner.mobileImageUrl : banner.desktopImageUrl;
  const linkType = isMobile ? banner.mobileLinkType : banner.desktopLinkType;

  return (
    <div className="relative w-full aspect-video max-h-80 md:max-h-96 overflow-hidden rounded-xl mb-6 md:mb-8 bg-gray-800">
      <img
        src={imageUrl}
        alt=""
        className={`w-full h-full object-cover ${linkType !== 'none' ? 'cursor-pointer' : ''}`}
        onClick={handleBannerClick}
      />
      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 p-2 rounded-full transition"
          >
            <ChevronLeft className="text-white w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 p-2 rounded-full transition"
          >
            <ChevronRight className="text-white w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={`w-2 h-2 rounded-full transition ${i === currentIndex ? 'bg-white scale-110' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
