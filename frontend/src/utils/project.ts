/** 项目模式（校对 / 原作者）相关的展示辅助 */

type FormatMessage = (descriptor: { id: string }) => string;

/**
 * 返回项目模式文案。
 * 两个布尔组合对应四种模式：
 * - false,false：翻嵌
 * - true,false：翻校嵌
 * - false,true：翻嵌作
 * - true,true：翻校嵌作
 */
export const getProjectModeLabel = (
  formatMessage: FormatMessage,
  withProofread?: boolean,
  withAuthor?: boolean,
) => {
  if (withProofread === false) {
    return formatMessage({
      id: withAuthor ? 'project.typeAuthor' : 'project.typeNoProofread',
    });
  }
  return formatMessage({
    id: withAuthor ? 'project.typeProofreadAuthor' : 'project.typeProofread',
  });
};

/**
 * 返回项目模式对应的 antd Tag 颜色。
 * - 翻嵌：default
 * - 翻校嵌：blue
 * - 翻嵌作：purple
 * - 翻校嵌作：magenta
 */
export const getProjectModeColor = (
  withProofread?: boolean,
  withAuthor?: boolean,
) => {
  if (withProofread === false) {
    return withAuthor ? 'purple' : 'default';
  }
  return withAuthor ? 'magenta' : 'blue';
};
