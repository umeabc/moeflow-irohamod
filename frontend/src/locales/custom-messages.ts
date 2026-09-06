// 站点品牌文案覆盖项：可后台运行修改，免改代码（非品牌文案已回退官方默认）。
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
  { key: "site.name", group: "brand", default: "萌翻", defaultEn: "Moeflow" },
  { key: "site.englishName", group: "brand", default: "Moetran", defaultEn: "Moetran" },
  { key: "site.slogan", group: "brand", default: "让翻译加速！", defaultEn: "Accelerate Translation!" },
  { key: "site.darkMode", group: "brand", default: "暗色模式", defaultEn: "Dark Mode" },
  { key: "file.blockTip", group: "brand", default: "非常抱歉，此图片存在敏感内容，无法在萌翻进行翻译。", defaultEn: "Sorry, this image contains sensitive content and cannot be translated." },
];
