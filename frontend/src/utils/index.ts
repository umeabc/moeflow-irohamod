import { isArray, isPlainObject } from 'lodash-es';

// 用于转换 JavaScript 中常用的大写简写
const abbrs = [
  ['ID', 'Id', 'id'],
  ['TXT', 'Txt', 'txt'],
  ['CAPTCHA', 'Captcha', 'captcha'],
];

// 将字符串从“小驼峰格式”转为“连字符格式”
function stringToHyphenCase(value: string) {
  return value.replace(/([A-Z])/g, '-$1').toLowerCase();
}
/**
 * 将字符串或对象的 key 从“小驼峰格式”转为“连字符格式”
 */
function toHyphenCase(value: string): string;
function toHyphenCase<T>(value: T): T;
function toHyphenCase(value: string | { [propNames: string]: any }) {
  if (typeof value === 'string') {
    return stringToHyphenCase(value);
  } else {
    const newValue: { [key: string]: any } = {};
    for (const key in value) {
      newValue[stringToHyphenCase(key)] = value[key];
    }
    return newValue;
  }
}

// 将字符串从“小驼峰格式”转为“下划线格式”
function stringToUnderScoreCase(value: string) {
  // 将全大写的简写提前替换
  abbrs.forEach((item) => {
    value = value.replace(item[0], item[1]);
  });
  return value.replace(/([A-Z])/g, '_$1').toLowerCase();
}
/**
 * 将字符串或对象的 key 从“小驼峰格式”转为“下划线格式”
 */
function toUnderScoreCase(value: string): string;
function toUnderScoreCase<T>(value: T): T;
function toUnderScoreCase(
  value: string | { [propNames: string]: any | any[] },
) {
  if (typeof value === 'string') {
    return stringToUnderScoreCase(value);
  } else if (isArray(value)) {
    return value.map((v: any) => toUnderScoreCase(v));
  } else if (isPlainObject(value)) {
    const newValue: { [key: string]: any } = {};
    for (const key in value) {
      if (isPlainObject(value[key])) {
        // 递归处理所以子对象
        newValue[stringToUnderScoreCase(key)] = toUnderScoreCase(value[key]);
      } else if (isArray(value[key])) {
        // 递归处理所以子数组
        newValue[stringToUnderScoreCase(key)] = value[key].map((v: any) => {
          if (isPlainObject(v)) return toUnderScoreCase(v);
          else return v;
        });
      } else {
        newValue[stringToUnderScoreCase(key)] = value[key];
      }
    }
    return newValue;
  } else {
    return value;
  }
}

// 将字符串从“下划线格式”转换为“小驼峰格式”
function stringToLowerCamelCase(value: string) {
  // 将全大写的简写提前替换
  abbrs.forEach((item) => {
    value = value.replace('_' + item[2], '_' + item[0]);
  });
  return value.replace(/_(\w)/g, (all, letter) => {
    return letter.toUpperCase();
  });
}
/**
 * 将字符串或对象的 key 从“下划线格式”转换为“小驼峰格式”
 */
function toLowerCamelCase(value: string): string;
function toLowerCamelCase<T>(value: T): T;
function toLowerCamelCase(
  value: string | { [propNames: string]: any } | any[],
) {
  if (typeof value === 'string') {
    return stringToLowerCamelCase(value);
  } else if (isArray(value)) {
    return value.map((v: any) => toLowerCamelCase(v));
  } else if (isPlainObject(value)) {
    const newValue: { [key: string]: any } = {};
    for (const key in value) {
      if (isPlainObject(value[key])) {
        // 递归处理所以子对象
        newValue[stringToLowerCamelCase(key)] = toLowerCamelCase(value[key]);
      } else if (isArray(value[key])) {
        // 递归处理所以子数组
        newValue[stringToLowerCamelCase(key)] = value[key].map((v: any) =>
          toLowerCamelCase(v),
        );
      } else {
        newValue[stringToLowerCamelCase(key)] = value[key];
      }
    }
    return newValue;
  } else {
    return value;
  }
}

interface FormError {
  name: string;
  errors: string[];
}
interface ToFormErrors {
  (value: { [propNames: string]: any }): FormError[];
}
/**
 * 将 API 返回的字段验证错误（下划线），转换为 Form 使用的错误列表（小驼峰）
 */
const toFormErrors: ToFormErrors = (value) => {
  const newValue = [];
  for (const key in value) {
    newValue.push({
      name: stringToLowerCamelCase(key),
      errors: value[key],
    });
  }
  return newValue;
};

/**
 * 将字符串转为复数
 */
const toPlural = (value: string) => {
  return value + 's';
};

/**
 * 去掉文件名（或任意字符串）中的 emoji/emoji 修饰符，保留其它字符
 */
const stripEmoji = (value: string) => {
  // eslint-disable-next-line no-control-regex
  return value.replace(
    /[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2764}\u{3030}\u{303D}\u{3297}\u{3299}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}]/gu,
    '',
  );
};

/**
 * 清理上传文件名：去掉 emoji 并去除首尾空白，返回可用文件名
 */
const sanitizeFilename = (value: string) => {
  return stripEmoji(value).trim();
};

export {
  toHyphenCase,
  toUnderScoreCase,
  toLowerCamelCase,
  toFormErrors,
  toPlural,
  stripEmoji,
  sanitizeFilename,
};
