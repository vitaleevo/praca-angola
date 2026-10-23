import { BadRequestException, Controller, Get, NotFoundException, Post, Req, Res, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { AuthenticatedUser } from "./auth/auth.types";
import { CurrentUser } from "./auth/current-user.decorator";
import { SessionGuard } from "./auth/session.guard";
import { DatabaseService } from "./database/database.service";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const mediaDirectory = () => process.env.MEDIA_DIR ?? join(process.cwd(), "apps", "api", "uploads");

function sniffImage(buffer: Buffer): { mime: string; extension: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: "png" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

@Controller("media")
export class MediaController {
  constructor(private readonly database: DatabaseService) {}

  @Post()
  @UseGuards(SessionGuard)
  async upload(@Req() request: Readable & { headers: Record<string, string | string[] | undefined>; resume(): void }, @CurrentUser() user: AuthenticatedUser) {
    const declaredLength = Number(request.headers["content-length"] ?? 0);
    if (declaredLength > MAX_IMAGE_BYTES) throw new BadRequestException({ code: "IMAGE_TOO_LARGE", message: "Cada imagem pode ter no máximo 5 MB." });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_IMAGE_BYTES) {
        request.resume();
        throw new BadRequestException({ code: "IMAGE_TOO_LARGE", message: "Cada imagem pode ter no máximo 5 MB." });
      }
      chunks.push(buffer);
    }
    const data = Buffer.concat(chunks);
    const image = sniffImage(data);
    if (!image) throw new BadRequestException({ code: "INVALID_IMAGE", message: "Envia uma imagem JPEG, PNG ou WebP válida." });
    let normalized:Buffer;
    try {
      const decoder=sharp(data,{limitInputPixels:20_000_000,failOn:'error'});
      const meta=await decoder.metadata();
      if(meta.format!==image.extension && !(meta.format==='jpeg'&&image.extension==='jpg'))throw new Error('Formato divergente.');
      if(!meta.width||!meta.height||meta.width<1||meta.height<1||meta.width*meta.height>20_000_000||(meta.pages??1)>1)throw new Error('Dimensões inválidas.');
      normalized=await decoder.rotate().resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
      if(normalized.length>MAX_IMAGE_BYTES)throw new Error('Imagem convertida demasiado grande.');
    } catch {throw new BadRequestException({code:'INVALID_IMAGE',message:'A imagem está danificada ou excede 20 milhões de píxeis.'});}
    const id = randomUUID();
    const storageKey = `${id}.webp`;
    await mkdir(mediaDirectory(), { recursive: true });
    await writeFile(join(mediaDirectory(), storageKey), normalized, { flag: "wx" });
    try {
      await this.database.query(
        "INSERT INTO media_assets (id, owner_user_id, storage_key, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5)",
        [id, user.id, storageKey, 'image/webp', normalized.length],
      );
    } catch (error) {
      const { unlink } = await import("node:fs/promises");
      await unlink(join(mediaDirectory(), storageKey)).catch(() => undefined);
      throw error;
    }
    return { id, url: `/api/v1/media/${id}`, mimeType: 'image/webp', sizeBytes: normalized.length };
  }

  @Get(":id")
  async read(@Req() request: { params: { id?: string } }, @Res() response: { setHeader(name: string, value: string): void; end(data?: Buffer): void; status(code: number): { end(): void } }) {
    const id = request.params.id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException();
    const result = await this.database.query<{ storage_key: string; mime_type: string }>("SELECT storage_key, mime_type FROM media_assets WHERE id = $1", [id]);
    const asset = result.rows[0];
    if (!asset || basename(asset.storage_key) !== asset.storage_key) throw new NotFoundException();
    let data: Buffer;
    try { data = await readFile(join(mediaDirectory(), asset.storage_key)); }
    catch { throw new NotFoundException(); }
    response.setHeader("Content-Type", asset.mime_type);
    response.setHeader("Content-Length", String(data.length));
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(data);
  }
}
