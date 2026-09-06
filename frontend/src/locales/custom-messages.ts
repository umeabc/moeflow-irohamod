// 自定义文案覆盖项（非品牌项已回退官方默认，品牌项 site.name/slogan/englishName 已移至站点设置页编辑）。
// 每个项提供中文(default)与英文(defaultEn)两个可编辑值，按语言分组生效。
export interface CustomMessageDef {
  key: string;
  group: string;
  default: string;
  defaultEn: string;
}
export const CUSTOM_MESSAGE_GROUPS: Record<string, string> = {
  brand: "admin.customMsgGroup.brand",
};

export const CUSTOM_MESSAGE_DEFS: CustomMessageDef[] = [
  { key: "site.darkMode", group: "brand", default: "暗色模式", defaultEn: "Dark Mode" },
  { key: "file.blockTip", group: "brand", default: "非常抱歉，此图片存在敏感内容，无法在萌翻进行翻译。", defaultEn: "Sorry, this image contains sensitive content and cannot be translated." },
];

/** 已移至站点设置页编辑的品牌文案 key（站点设置页负责读写，自定义文案页保存时需原样保留） */
export const BRAND_TEXT_KEYS: string[] = [
  "site.name",
  "site.slogan",
  "site.englishName",
];
