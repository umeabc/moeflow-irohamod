import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '@/store';
import { setDarkMode, setPalette } from '@/store/site/slice';
import { paletteStorage, themeStorage } from '@/utils/storage';
import { applyTheme, ThemePalette } from '@/utils/theme';

/** 所有入口共用偏好、DOM 和 Redux 的更新逻辑。 */
export function useTheme() {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: AppState) => state.site.darkMode);
  const palette = useSelector((state: AppState) => state.site.palette);

  const changeDarkMode = (checked: boolean) => {
    dispatch(setDarkMode(checked));
    themeStorage.save(checked);
    applyTheme(checked, palette);
  };
  const changePalette = (nextPalette: ThemePalette) => {
    dispatch(setPalette(nextPalette));
    paletteStorage.save(nextPalette);
    applyTheme(darkMode, nextPalette);
  };

  return { darkMode, palette, changeDarkMode, changePalette };
}
