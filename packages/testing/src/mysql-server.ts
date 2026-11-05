export interface MysqlServer {
  host: string;
  port: number;
  rootPassword: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    mysql: MysqlServer;
  }
}
