import { useEffect, useState } from 'react';
import { api } from '@/apis';

let cachedMascotURL: string | null | undefined;
let cachedFaviconURL: string | null | undefined;
let fetchPromise: Promise<{ mascot: string; favicon: string }> | null = null;

/** 拉取站点品牌图片配置（有自定义则返回访问 URL，否则为空串），带模块级缓存 */
export function fetchBrandAssets(): Promise<{ mascot: string; favicon: string }> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = api.siteSetting
    .getBrandAssets({})
    .then((res) => {
      cachedMascotURL = res.data.mascot || '';
      cachedFaviconURL = res.data.favicon || '';
      return { mascot: cachedMascotURL, favicon: cachedFaviconURL };
    })
    .catch(() => {
      cachedMascotURL = '';
      cachedFaviconURL = '';
      return { mascot: '', favicon: '' };
    });
  return fetchPromise;
}

/**
 * 获取站点 mascot 的访问 URL（未配置自定义时返回 ''，由调用方回退到默认图）。
 * 加载完成前返回 null，便于调用方等待后决定是否覆盖默认图。
 */
export function useBrandMascot(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchBrandAssets().then(({ mascot }) => {
      if (active) setUrl(mascot || '');
    });
    return () => {
      active = false;
    };
  }, []);
  return url;
}

/** 应用自定义 favicon 到 <link rel="icon">（未配置则保持默认静态 favicon） */
export function applyBrandFavicon(): void {
  fetchBrandAssets().then(({ favicon }) => {
    if (!favicon) return;
    const link =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ||
      document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
    if (link) {
      link.href = favicon;
    } else {
      const newLink = document.createElement('link');
      newLink.rel = 'icon';
      newLink.href = favicon;
      document.head.appendChild(newLink);
    }
  });
}
