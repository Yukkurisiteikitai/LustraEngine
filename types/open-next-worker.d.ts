declare module './.open-next/worker.js' {
  const worker: {
    fetch(request: Request, env: any, ctx?: any): Promise<Response>;
    queue?: (batch: any, env: any, ctx?: any) => Promise<void>;
    scheduled?: (controller: any, env: any, ctx?: any) => Promise<void>;
    [key: string]: any;
  };
  export default worker;
}

declare module '\/.open-next\/worker.js' {
  const worker: any;
  export default worker;
}
