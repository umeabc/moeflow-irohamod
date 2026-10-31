export const formatBytes = (bytes?: number | null): string => {
  if (bytes == null || bytes < 0) return '—';
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};
