type JsonValue =
  | null
  | string
  | number
  | boolean
  | { [x: string]: JsonValue }
  | Array<JsonValue>;

type JsonObject = { [x: string]: JsonValue };

export class JsonBufferSerializer {
  serialize(content: JsonObject): Buffer {
    return Buffer.from(JSON.stringify(content));
  }

  deserialize<T = JsonObject>(content: Buffer): T {
    return JSON.parse(content.toString());
  }
}
