import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { DatabaseService } from "./database/database.service";
import { LISTING_MARKETPLACES, ListingMarketplace } from "./listing-attributes";

const imageSelect = `COALESCE((SELECT json_agg(json_build_object('url', li.image_url, 'alt', li.alt_text) ORDER BY li.sort_order)
  FROM listing_images li WHERE li.listing_id = l.id), '[]'::json) AS images`;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

class CategoryQuery {
  @IsOptional() @IsIn([...LISTING_MARKETPLACES]) marketplace?: ListingMarketplace;
}

class StoreDirectoryQuery {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(100) province?: string;
  @IsOptional() @IsIn(["featured", "products_desc", "rating_desc", "name_asc"]) sort?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}

class StorefrontQuery {
  @IsOptional() @IsString() @MaxLength(140) q?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsIn(["recent", "price_asc", "price_desc"]) sort?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}
class ListingQuery {
  @IsOptional() @IsIn([...LISTING_MARKETPLACES]) marketplace?: ListingMarketplace;
  @IsOptional() @IsIn(['individual','business','']) sellerType?:string;
  @IsOptional() @IsIn(['true','']) verified?:string;
  @IsOptional() @IsIn(['1','3','7','30','']) days?:string;
  @IsOptional() @IsString() @MaxLength(140) q?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(100) province?: string;
  @IsOptional() @IsString() @MaxLength(100) municipality?: string;
  @IsOptional() @IsIn(["new", "used", "refurbished"]) condition?: string;
  @IsOptional() @IsIn(["venda", "arrendamento", ""]) transaction?: string;
  @IsOptional() @IsIn(["loja", "fornecedor", "prestador", "distribuidor", "fabricante", ""]) companyType?: string;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsOptional() @IsIn(["gasolina", "gasoleo", "eletrico", "hibrido", "gpl", ""]) fuel?: string;
  @IsOptional() @IsString() @MaxLength(60) make?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) yearMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
  @IsOptional() @IsIn(["recent", "price_asc", "price_desc"]) sort?: string;
  @IsOptional() page?: string;
  @IsOptional() limit?: string;
}

@Controller("catalog")
export class CatalogController {
  constructor(private readonly database: DatabaseService) {}

  @Get("categories")
  categories(@Query() query: CategoryQuery) {
    const marketplace = query.marketplace ?? "produtos";
    return this.database.query(
      `SELECT c.id, c.name, c.slug, c.description, c.parent_id
       FROM categories c JOIN marketplaces m ON m.id = c.marketplace_id
       WHERE c.is_active = true AND m.slug = $1 ORDER BY c.sort_order, c.name`,
      [marketplace],
    ).then((result) => result.rows);
  }

  @Get("listings")
  async listings(@Query() query: ListingQuery) {
    const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page ?? "1", 10) || 1));
    const limit = Math.max(1, Math.min(48, Number.parseInt(query.limit ?? "24", 10) || 24));
    const marketplace = query.marketplace ?? "produtos";
    const where = ["l.status = 'published'", "l.available_quantity > 0", "s.status = 'active'"];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };
    add("m.slug = ?", marketplace);
    if (query.q?.trim()) {
      values.push(`%${escapeLike(query.q.trim())}%`);
      const placeholder = `$${values.length}`;
      where.push(`(l.title ILIKE ${placeholder} ESCAPE E'\\\\' OR l.description ILIKE ${placeholder} ESCAPE E'\\\\')`);
    }
    if (query.category) add("c.slug = ?", query.category);
    if (query.province) add("l.province = ?", query.province);
    if (query.municipality) add("l.municipality = ?", query.municipality);
    if (query.condition) add("l.condition = ?", query.condition);
    if(query.sellerType) add('s.profile_type = ?',query.sellerType);
    if(query.verified==='true') where.push('s.is_verified');
    if(query.days) add("l.published_at >= now() - (?::int * interval '1 day')",query.days);
    if (query.transaction) add("l.attributes->>'transaction' = ?", query.transaction);
    if (query.companyType) add("l.attributes->>'companyType' = ?", query.companyType);
    if (query.fuel) add("l.attributes->>'fuel' = ?", query.fuel);
    if (query.bedrooms !== undefined) add("(l.attributes->>'bedrooms')::int >= ?", query.bedrooms);
    if (query.yearMin !== undefined) add("(l.attributes->>'year')::int >= ?", query.yearMin);
    if (query.sector?.trim()) {
      values.push(`%${escapeLike(query.sector.trim())}%`);
      where.push(`l.attributes->>'sector' ILIKE $${values.length} ESCAPE E'\\\\'`);
    }
    if (query.make?.trim()) {
      values.push(`%${escapeLike(query.make.trim())}%`);
      where.push(`l.attributes->>'make' ILIKE $${values.length} ESCAPE E'\\\\'`);
    }
    if (query.minPrice !== undefined) add("l.price >= ?", query.minPrice);
    if (query.maxPrice !== undefined) add("l.price <= ?", query.maxPrice);
    const predicate = where.join(" AND ");
    const count = await this.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id JOIN categories c ON c.id = l.category_id JOIN marketplaces m ON m.id = c.marketplace_id WHERE ${predicate}`,
      values,
    );
    const sort = query.sort === "price_asc" ? "l.price ASC, l.published_at DESC" : query.sort === "price_desc" ? "l.price DESC, l.published_at DESC" : "l.published_at DESC, l.id";
    const offset = (page - 1) * limit;
    const result = await this.database.query(
      `SELECT l.id, l.slug, l.title, l.description, l.price::text, l.currency, l.condition,
              l.price_negotiable, l.available_quantity, l.province, l.municipality, l.published_at, l.attributes,
              m.slug AS marketplace, m.name AS marketplace_name,
              c.name AS category, c.slug AS category_slug, s.slug AS store_slug, s.display_name AS store_name,
              ${imageSelect}
       FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id JOIN categories c ON c.id = l.category_id JOIN marketplaces m ON m.id = c.marketplace_id
       WHERE ${predicate} ORDER BY ${sort} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    const total = Number(count.rows[0]?.total ?? 0);
    return { items: result.rows, page, limit, total, pages: Math.ceil(total / limit) };
  }

  @Get("listings/:slug")
  async listing(@Param("slug") slug: string) {
    const result = await this.database.query(
      `SELECT l.id, l.slug, l.title, l.description, l.price::text, l.currency, l.condition,
              l.price_negotiable, l.available_quantity, l.province, l.municipality, l.published_at, l.attributes,
              m.slug AS marketplace, m.name AS marketplace_name,
              c.name AS category, c.slug AS category_slug, s.id AS store_id, s.slug AS store_slug,
              s.display_name AS store_name, s.description AS store_description, s.province AS store_province,
              s.municipality AS store_municipality, s.is_verified, ${imageSelect}
       FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id JOIN categories c ON c.id = l.category_id JOIN marketplaces m ON m.id = c.marketplace_id
       WHERE l.slug = $1 AND l.status = 'published' AND l.available_quantity > 0 AND s.status = 'active'`,
      [slug],
    );
    if (!result.rowCount) throw new NotFoundException({ code: "LISTING_NOT_FOUND", message: "Este anúncio já não está disponível." });
    return result.rows[0];
  }

  @Get("stores")
  async stores(@Query() query: StoreDirectoryQuery) {
    const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page ?? "1", 10) || 1));
    const limit = Math.max(1, Math.min(48, Number.parseInt(query.limit ?? "12", 10) || 12));
    const where = ["s.status = 'active'"];
    const values: unknown[] = [];
    if (query.q?.trim()) {
      values.push("%" + query.q.trim().replace(/[\\%_]/g, "\\$&") + "%");
      const placeholder = "$" + values.length;
      where.push("(s.display_name ILIKE " + placeholder + " ESCAPE E'\\\\' OR s.description ILIKE " + placeholder + " ESCAPE E'\\\\')");
    }
    if (query.province?.trim()) {
      values.push(query.province.trim());
      where.push("s.province = $" + values.length);
    }
    const predicate = where.join(" AND ");
    const [count, provinces] = await Promise.all([
      this.database.query<{ total: string }>("SELECT count(*)::text AS total FROM seller_profiles s WHERE " + predicate, values),
      this.database.query<{ province: string }>("SELECT DISTINCT province FROM seller_profiles WHERE status = 'active' ORDER BY province"),
    ]);
    const sort = query.sort === "products_desc"
      ? "listing_count DESC, s.is_verified DESC, s.display_name"
      : query.sort === "rating_desc"
        ? "average_rating DESC NULLS LAST, review_count DESC, s.is_verified DESC, s.display_name"
        : query.sort === "name_asc"
          ? "s.display_name ASC"
          : "s.is_verified DESC, listing_count DESC, s.display_name";
    const offset = (page - 1) * limit;
    const result = await this.database.query(
      "SELECT s.id, s.slug, s.profile_type, s.display_name, s.description, s.province, s.municipality, s.is_verified, " +
      "CASE WHEN s.logo_media_asset_id IS NOT NULL THEN '/api/v1/media/' || s.logo_media_asset_id END AS logo_url, " +
      "CASE WHEN s.cover_media_asset_id IS NOT NULL THEN '/api/v1/media/' || s.cover_media_asset_id END AS cover_url, " +
      "count(DISTINCT l.id)::int AS listing_count, round(avg(r.rating), 1)::float AS average_rating, " +
      "count(DISTINCT r.id)::int AS review_count " +
      "FROM seller_profiles s LEFT JOIN listings l ON l.seller_profile_id = s.id AND l.status = 'published' AND l.available_quantity > 0 " +
      "LEFT JOIN reviews r ON r.seller_profile_id = s.id WHERE " + predicate +
      " GROUP BY s.id ORDER BY " + sort + " LIMIT $" + (values.length + 1) + " OFFSET $" + (values.length + 2),
      [...values, limit, offset],
    );
    const total = Number(count.rows[0]?.total ?? 0);
    return { items: result.rows, page, limit, total, pages: Math.ceil(total / limit), provinces: provinces.rows.map((row) => row.province) };
  }

  @Get("stores/:slug")
  async store(@Param("slug") slug: string, @Query() query: StorefrontQuery) {
    const store = await this.database.query(
      "SELECT s.id, s.slug, s.profile_type, s.display_name, s.description, s.province, s.municipality, s.is_verified, " +
      "CASE WHEN s.logo_media_asset_id IS NOT NULL THEN '/api/v1/media/' || s.logo_media_asset_id END AS logo_url, " +
      "CASE WHEN s.cover_media_asset_id IS NOT NULL THEN '/api/v1/media/' || s.cover_media_asset_id END AS cover_url, " +
      "CASE WHEN s.contact_email_public THEN s.contact_email END AS contact_email, " +
      "CASE WHEN s.contact_phone_public THEN s.contact_phone END AS contact_phone, " +
      "s.delivery_policy, s.returns_policy, s.terms_policy, " +
      "round(avg(r.rating), 1)::float AS average_rating, count(DISTINCT r.id)::int AS review_count, " +
      "(SELECT count(*)::int FROM listings l WHERE l.seller_profile_id = s.id AND l.status = 'published' AND l.available_quantity > 0) AS listing_count " +
      "FROM seller_profiles s LEFT JOIN reviews r ON r.seller_profile_id = s.id " +
      "WHERE s.slug = $1 AND s.status = 'active' GROUP BY s.id",
      [slug],
    );
    if (!store.rowCount) throw new NotFoundException({ code: "STORE_NOT_FOUND", message: "Loja não encontrada." });
    const storeId = (store.rows[0] as { id: string }).id;
    const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page ?? "1", 10) || 1));
    const limit = Math.max(1, Math.min(48, Number.parseInt(query.limit ?? "24", 10) || 24));
    const where = ["l.seller_profile_id = $1", "l.status = 'published'", "l.available_quantity > 0"];
    const values: unknown[] = [storeId];
    if (query.q?.trim()) {
      values.push("%" + query.q.trim().replace(/[\\%_]/g, "\\$&") + "%");
      const placeholder = "$" + values.length;
      where.push("(l.title ILIKE " + placeholder + " ESCAPE E'\\\\' OR l.description ILIKE " + placeholder + " ESCAPE E'\\\\')");
    }
    if (query.category) {
      values.push(query.category);
      where.push("c.slug = $" + values.length);
    }
    const predicate = where.join(" AND ");
    const [count, categories] = await Promise.all([
      this.database.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM listings l JOIN categories c ON c.id = l.category_id WHERE " + predicate,
        values,
      ),
      this.database.query(
        "SELECT c.slug, c.name, count(l.id)::int AS product_count " +
        "FROM categories c JOIN marketplaces m ON m.id = c.marketplace_id " +
        "LEFT JOIN listings l ON l.category_id = c.id AND l.seller_profile_id = $1 AND l.status = 'published' AND l.available_quantity > 0 " +
        "WHERE c.is_active AND m.slug = 'produtos' GROUP BY c.id ORDER BY c.sort_order, c.name",
        [storeId],
      ),
    ]);
    const sort = query.sort === "price_asc" ? "l.price ASC, l.published_at DESC" : query.sort === "price_desc" ? "l.price DESC, l.published_at DESC" : "l.published_at DESC, l.id";
    const offset = (page - 1) * limit;
    const listings = await this.database.query(
      "SELECT l.id, l.slug, l.title, l.description, l.price::text, l.currency, l.condition, " +
      "l.price_negotiable, l.available_quantity, l.province, l.municipality, l.published_at, l.attributes, " +
      "m.slug AS marketplace, m.name AS marketplace_name, " +
      "c.name AS category, c.slug AS category_slug, s.slug AS store_slug, s.display_name AS store_name, " +
      imageSelect + " FROM listings l JOIN categories c ON c.id = l.category_id JOIN marketplaces m ON m.id = c.marketplace_id JOIN seller_profiles s ON s.id = l.seller_profile_id " +
      "WHERE " + predicate + " ORDER BY " + sort + " LIMIT $" + (values.length + 1) + " OFFSET $" + (values.length + 2),
      [...values, limit, offset],
    );
    const total = Number(count.rows[0]?.total ?? 0);
    return { store: store.rows[0], listings: listings.rows, categories: categories.rows, page, limit, total, pages: Math.ceil(total / limit) };
  }
}
