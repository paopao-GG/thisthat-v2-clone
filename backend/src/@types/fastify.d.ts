import '@fastify/cookie';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyReply {
    setCookie(
      name: string,
      value: string,
      options?: {
        domain?: string;
        expires?: Date;
        httpOnly?: boolean;
        maxAge?: number;
        path?: string;
        sameSite?: boolean | 'lax' | 'strict' | 'none';
        secure?: boolean;
        signed?: boolean;
      }
    ): this;
    
    clearCookie(
      name: string,
      options?: {
        domain?: string;
        path?: string;
      }
    ): this;
    
    unsignCookie(value: string): {
      valid: boolean;
      renew: boolean;
      value: string | null;
    };
  }

  interface FastifyRequest {
    cookies: { [cookieName: string]: string | undefined };
  }
}

