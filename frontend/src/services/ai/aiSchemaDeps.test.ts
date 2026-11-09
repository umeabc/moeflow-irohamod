import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** 只覆盖断言用到的 JSON Schema 字段 */
interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: string[];
}

/**
 * 自动翻译（LLM 预处理）通过 @xsai/tool 把 zod schema 转成 JSON Schema 发给模型。
 * xsschema 自身不安装转换器，只把 zod-to-json-schema 声明为 optional peer dependency；
 * 一旦它被当作「无用依赖」删掉，调用 tool() 会直接抛出
 * `xsschema: Missing zod v3 dependencies "zod-to-json-schema"`，机翻全部不可用。
 * 这里锁定该依赖存在且能转换本仓库用到的 schema 结构。
 */
describe('AI tool schema dependencies', () => {
  it('converts the zod v3 schema used by the translate tool', () => {
    const schema = z.object({
      imageW: z.number(),
      imageH: z.number(),
      texts: z.array(
        z.object({
          text: z.string(),
          translated: z.string(),
          rank: z.number(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
      ),
    });

    // zod-to-json-schema 的类型声明与当前 zod 3.25 类型存在轻微版本偏差，
    // 运行时转换正常；这里只断言产出的 JSON Schema 结构。
    const convert = zodToJsonSchema as unknown as (
      value: unknown,
      options: { $refStrategy: 'none' },
    ) => JsonSchemaNode;
    const jsonSchema = convert(schema, { $refStrategy: 'none' });

    expect(jsonSchema.type).toBe('object');
    expect(Object.keys(jsonSchema.properties ?? {})).toEqual([
      'imageW',
      'imageH',
      'texts',
    ]);
    expect(jsonSchema.properties?.texts.type).toBe('array');
    expect(jsonSchema.properties?.texts.items?.required).toContain('translated');
    expect(jsonSchema.required).toEqual(['imageW', 'imageH', 'texts']);
  });
});
