// Minimal Workers binding types so the project does not need
// @cloudflare/workers-types as a direct dependency.
declare global {
  interface D1Result<T = unknown> {
    results?: T[]
    success: boolean
    meta: Record<string, unknown>
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    first<T = unknown>(colName?: string): Promise<T | null>
    all<T = unknown>(): Promise<D1Result<T>>
    run(): Promise<D1Result>
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
    exec(query: string): Promise<D1Result>
  }

  interface R2ObjectBody {
    body: ReadableStream
    size: number
    httpMetadata?: { contentType?: string }
    writeHttpMetadata(headers: Headers): void
  }

  interface R2Bucket {
    put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
      options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
    ): Promise<unknown>
    get(key: string): Promise<R2ObjectBody | null>
    delete(key: string | string[]): Promise<void>
  }
}

export {}
