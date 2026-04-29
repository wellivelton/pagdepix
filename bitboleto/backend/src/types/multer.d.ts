declare module 'multer' {
  import { Request } from 'express';

  export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer?: Buffer;
  }

  export interface DiskStorageOptions {
    destination?(
      req: Request,
      file: File,
      cb: (error: Error | null, destination: string) => void
    ): void;
    filename?(
      req: Request,
      file: File,
      cb: (error: Error | null, filename: string) => void
    ): void;
  }

  export function diskStorage(options: DiskStorageOptions): StorageEngine;

  export interface StorageEngine {
    _handleFile(
      req: Request,
      file: File,
      cb: (error: Error | null, info: Partial<File>) => void
    ): void;
    _removeFile(req: Request, file: File, cb: (error: Error | null) => void): void;
  }

  export interface Options {
    dest?: string;
    storage?: StorageEngine;
    fileFilter?(
      req: Request,
      file: File,
      cb: (error: Error | null, acceptFile: boolean) => void
    ): void;
    limits?: { fieldNameSize?: number; fieldSize?: number; fields?: number; fileSize?: number; files?: number; headerPairs?: number };
  }

  type RequestHandler = import('express').RequestHandler;

  interface MulterInstance {
    single(name: string): RequestHandler;
    array(name: string, maxCount?: number): RequestHandler;
    fields(fields: { name: string; maxCount: number }[]): RequestHandler;
    none(): RequestHandler;
  }

  interface Multer {
    (options?: Options): RequestHandler & MulterInstance;
    diskStorage(options: DiskStorageOptions): StorageEngine;
  }

  const multer: Multer;
  export default multer;
}
