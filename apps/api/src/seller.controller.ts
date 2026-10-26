import { BadRequestException, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Body, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min, Matches, IsUUID } from "class-validator";
import { Type } from "class-transformer";
import { randomBytes } from "node:crypto";
import { StoreContextService } from "./store-context.service";
import { DatabaseService } from "./database/database.service";
import { AuthenticatedUser } from "./auth/auth.types";
import { CurrentUser } from "./auth/current-user.decorator";
import { SessionGuard } from "./auth/session.guard";
import { decryptPrivateValue, encryptPrivateValue } from "./auth/auth.crypto";
import { maskPaymentIdentifier } from "./payments/payment-methods";
import { AiClientService } from "./ai/ai-client.service";
import { ModerationAlertsService } from "./moderation-alerts.service";
import { LISTING_MARKETPLACES, ListingMarketplace, parseListingAttributes } from "./listing-attributes";

class StoreDto {
  @IsIn(["individual", "business"]) profileType!: "individual" | "business";
  @IsString() @Length(2, 100) displayName!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsString() @Length(2, 100) province!: string;
  @IsString() @Length(2, 100) municipality!: string;
  @IsOptional() @IsUUID("4") logoImageId?: string;
  @IsOptional() @IsUUID("4") coverImageId?: string;
  @IsOptional() @IsBoolean() clearLogo?: boolean;
  @IsOptional() @IsBoolean() clearCover?: boolean;
  @IsOptional() @IsString() @MaxLength(100) mcxRecipientName?: string;
  @IsOptional() @IsString() @Matches(/^(?:\+244)?9\d{8}$/) mcxPhone?: string | null;
  @IsOptional() @IsBoolean() mcxEnabled?: boolean;
  @IsOptional() @IsBoolean() clearPaymentDestination?: boolean;
  @IsOptional() @IsString() @Length(2, 100) bankName?: string | null;
  @IsOptional() @IsString() @Length(2, 100) bankAccountHolder?: string | null;
  @IsOptional() @IsString() @Length(5, 64) @Matches(/^[A-Za-z0-9][A-Za-z0-9\s/-]{4,63}$/) bankAccountIdentifier?: string | null;
  @IsOptional() @IsBoolean() bankTransferEnabled?: boolean;
  @IsOptional() @IsBoolean() clearBankTransfer?: boolean;
  @IsOptional() @IsEmail() @MaxLength(254) contactEmail?: string | null;
  @IsOptional() @IsBoolean() contactEmailPublic?: boolean;
  @IsOptional() @IsString() @Matches(/^(?:\+244)?9\d{8}$/) contactPhone?: string | null;
  @IsOptional() @IsBoolean() contactPhonePublic?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) deliveryPolicy?: string;
  @IsOptional() @IsString() @MaxLength(2000) returnsPolicy?: string;
  @IsOptional() @IsString() @MaxLength(2000) termsPolicy?: string;
}

class StoreMemberRoleDto {
  @IsIn(["editor", "support"]) role!: "editor" | "support";
}

class ListingDto {
  @IsString() @Length(4, 140) title!: string;
  @IsString() @Length(10, 8000) description!: string;
  @IsOptional() @IsIn([...LISTING_MARKETPLACES]) marketplace?: ListingMarketplace;
  @IsString() @Length(2, 80) categorySlug!: string;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) price!: number;
  @IsIn(["new", "used", "refurbished"]) condition!: "new" | "used" | "refurbished";
  @IsOptional() @IsBoolean() priceNegotiable?: boolean;
  @Type(() => Number) @IsInt() @Min(1) @Max(100_000) availableQuantity!: number;
  @IsString() @Length(2, 100) province!: string;
  @IsString() @Length(2, 100) municipality!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsUUID("4", { each: true }) imageIds?: string[];
}

class ListingStatusDto {
  @IsIn(["published", "paused", "archived"]) status!: "published" | "paused" | "archived";
}

function slugify(value: string): string {
  const slug = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
  return `${slug || "loja"}-${randomBytes(3).toString("hex")}`;
}

@Controller("seller")
@UseGuards(SessionGuard)
export class SellerController {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: StoreContextService,
    private readonly aiClient: AiClientService,
    private readonly moderationAlerts: ModerationAlertsService,
  ) {}

  @Get("profile")
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.database.query(
      `SELECT s.id, s.profile_type, s.slug, s.display_name, s.description, s.province, s.municipality, s.status, s.is_verified,
              s.logo_media_asset_id, s.cover_media_asset_id, s.delivery_policy, s.returns_policy, s.terms_policy,
              s.contact_email, s.contact_email_public, s.contact_phone, s.contact_phone_public, sm.role,
              (s.owner_user_id = $1 AND s.mcx_phone_ciphertext IS NOT NULL) AS has_payment_destination,
              (s.owner_user_id = $1) AS is_owner
       FROM seller_profiles s JOIN store_memberships sm ON sm.seller_profile_id = s.id
       WHERE sm.user_id = $1 AND ($2::uuid IS NULL OR s.id = $2) ORDER BY (sm.role = 'owner') DESC, sm.created_at, s.id LIMIT 1`,
      [user.id, user.activeStoreId ?? null],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return { profile: null };
    const privateData = row.is_owner
      ? await this.database.query<{ mcx_phone_ciphertext: string | null; }>("SELECT mcx_phone_ciphertext FROM seller_profiles WHERE id = $1 AND owner_user_id = $2", [row.id, user.id])
      : { rows: [] as Array<{ mcx_phone_ciphertext: string | null }> };
    const ciphertext = privateData.rows[0]?.mcx_phone_ciphertext;
    let maskedPhone: string | null = null;
    if (ciphertext) {
      try { const phone = decryptPrivateValue(ciphertext); maskedPhone = `•••• ${phone.slice(-4)}`; } catch { maskedPhone = "configured"; }
    }
    const paymentMethodRows = row.is_owner
      ? await this.database.query<{
          method: string;
          enabled: boolean;
          recipient_name_ciphertext: string;
          recipient_identifier_ciphertext: string;
          provider_name_ciphertext: string | null;
        }>(
          `SELECT method, enabled, recipient_name_ciphertext, recipient_identifier_ciphertext, provider_name_ciphertext
           FROM seller_payment_methods WHERE seller_profile_id = $1 ORDER BY method`,
          [row.id],
        )
      : { rows: [] as Array<{ method: string; enabled: boolean; recipient_name_ciphertext: string; recipient_identifier_ciphertext: string; provider_name_ciphertext: string | null }> };
    const paymentMethods = paymentMethodRows.rows.map((method) => {
      let recipientName: string | null = null;
      let providerName: string | null = null;
      let maskedIdentifier = "configurado";
      try { recipientName = decryptPrivateValue(method.recipient_name_ciphertext); } catch { /* Keep private values out of fallback responses. */ }
      try { maskedIdentifier = maskPaymentIdentifier(decryptPrivateValue(method.recipient_identifier_ciphertext)); } catch { /* Keep the method status visible without exposing ciphertext. */ }
      if (method.provider_name_ciphertext) {
        try { providerName = decryptPrivateValue(method.provider_name_ciphertext); } catch { /* Keep private values out of fallback responses. */ }
      }
      return { method: method.method, enabled: method.enabled, configured: true, recipientName, providerName, maskedIdentifier };
    });
    return {
      profile: {
        ...row,
        contact_email: row.contact_email_public ? row.contact_email : null,
        contact_phone: row.contact_phone_public ? row.contact_phone : null,
        has_payment_destination: Boolean(ciphertext),
        masked_phone: maskedPhone,
        payment_methods: paymentMethods,
      },
    };
  }

  @Put("profile")
  async saveProfile(@Body() body: StoreDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.activeStoreId) await this.context.owner(user);
    if (body.clearPaymentDestination && (body.mcxRecipientName?.trim() || body.mcxPhone?.trim() || body.mcxEnabled)) {
      throw new BadRequestException({ code: "MCX_CLEAR_CONFLICT", message: "Desativa o Multicaixa Express antes de apagar os dados guardados." });
    }
    if (body.clearBankTransfer && ([body.bankName, body.bankAccountHolder, body.bankAccountIdentifier].some((value) => Boolean(value?.trim())) || body.bankTransferEnabled)) {
      throw new BadRequestException({ code: "BANK_TRANSFER_CLEAR_CONFLICT", message: "Desativa a transferência bancária antes de apagar os dados guardados." });
    }
    if (body.contactEmailPublic && !body.contactEmail?.trim()) {
      throw new BadRequestException({ code: "PUBLIC_EMAIL_REQUIRED", message: "Indica o e-mail que autorizas a publicar." });
    }
    if (body.contactPhonePublic && !body.contactPhone?.trim()) {
      throw new BadRequestException({ code: "PUBLIC_PHONE_REQUIRED", message: "Indica o telefone que autorizas a publicar." });
    }
    const nameCipher = body.clearPaymentDestination ? null : body.mcxRecipientName ? encryptPrivateValue(body.mcxRecipientName.trim()) : null;
    const phoneCipher = body.clearPaymentDestination ? null : body.mcxPhone ? encryptPrivateValue(body.mcxPhone.replace(/\s/g, "")) : null;
    const contactEmail = body.contactEmailPublic ? body.contactEmail?.trim().toLowerCase() ?? null : null;
    const contactPhone = body.contactPhonePublic ? body.contactPhone?.replace(/\s/g, "") ?? null : null;
    try {
      await this.database.transaction(async (client) => {
        for (const imageId of [body.logoImageId, body.coverImageId].filter((value): value is string => Boolean(value))) {
          const ownedImage = await client.query("SELECT id FROM media_assets WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL", [imageId, user.id]);
          if (!ownedImage.rowCount) throw new BadRequestException({ code: "INVALID_STORE_IMAGE", message: "Uma das imagens da loja não está disponível." });
        }
        const existing = await client.query<{ id: string; mcx_recipient_name_ciphertext: string | null; mcx_phone_ciphertext: string | null }>("SELECT id, mcx_recipient_name_ciphertext, mcx_phone_ciphertext FROM seller_profiles WHERE owner_user_id = $1 AND ($2::uuid IS NULL OR id = $2) ORDER BY created_at,id LIMIT 1 FOR UPDATE", [user.id, user.activeStoreId ?? null]);
        if (!body.clearPaymentDestination && Boolean(body.mcxPhone) !== Boolean(body.mcxRecipientName)) {
          const counterpartExists = body.mcxPhone
            ? Boolean(existing.rows[0]?.mcx_recipient_name_ciphertext)
            : Boolean(existing.rows[0]?.mcx_phone_ciphertext);
          if (!counterpartExists) throw new BadRequestException({ code: "MCX_FIELDS_REQUIRED_TOGETHER", message: "Indica o nome e o número Multicaixa Express juntos." });
        }
        let profile;
        if (existing.rowCount) {
          profile = await client.query(
            `UPDATE seller_profiles SET profile_type = $2, display_name = $3, description = $4, province = $5, municipality = $6,
             mcx_recipient_name_ciphertext = CASE WHEN $7 THEN NULL ELSE COALESCE($8, mcx_recipient_name_ciphertext) END,
             mcx_phone_ciphertext = CASE WHEN $7 THEN NULL ELSE COALESCE($9, mcx_phone_ciphertext) END,
             logo_media_asset_id = CASE WHEN $10 THEN NULL ELSE COALESCE($11, logo_media_asset_id) END,
             cover_media_asset_id = CASE WHEN $12 THEN NULL ELSE COALESCE($13, cover_media_asset_id) END,
             contact_email = $14, contact_email_public = $15,
             contact_email_public_at = CASE WHEN $15 THEN COALESCE(contact_email_public_at, now()) ELSE NULL END,
             contact_phone = $16, contact_phone_public = $17,
             contact_phone_public_at = CASE WHEN $17 THEN COALESCE(contact_phone_public_at, now()) ELSE NULL END,
             delivery_policy = $18, returns_policy = $19, terms_policy = $20, updated_at = now()
             WHERE id = $1 RETURNING id, slug, display_name, description, province, municipality, status, is_verified,
             logo_media_asset_id, cover_media_asset_id, delivery_policy, returns_policy, terms_policy,
             contact_email, contact_email_public, contact_phone, contact_phone_public,
             (mcx_phone_ciphertext IS NOT NULL) AS has_payment_destination`,
            [existing.rows[0].id, body.profileType, body.displayName.trim(), body.description.trim(), body.province.trim(), body.municipality.trim(), Boolean(body.clearPaymentDestination), nameCipher, phoneCipher, Boolean(body.clearLogo), body.logoImageId ?? null, Boolean(body.clearCover), body.coverImageId ?? null, contactEmail, Boolean(body.contactEmailPublic), contactPhone, Boolean(body.contactPhonePublic), body.deliveryPolicy?.trim() ?? "", body.returnsPolicy?.trim() ?? "", body.termsPolicy?.trim() ?? ""],
          );
        } else {
          const membership = await client.query("SELECT 1 FROM store_memberships WHERE user_id = $1 LIMIT 1", [user.id]);
          if (membership.rowCount) throw new ForbiddenException({ code: "STORE_OWNER_REQUIRED", message: "Só o proprietário pode criar ou gerir uma loja." });
          profile = await client.query(
            `INSERT INTO seller_profiles (profile_type, owner_user_id, slug, display_name, description, province, municipality,
             mcx_recipient_name_ciphertext, mcx_phone_ciphertext, logo_media_asset_id, cover_media_asset_id,
             contact_email, contact_email_public, contact_email_public_at, contact_phone, contact_phone_public,
             contact_phone_public_at, delivery_policy, returns_policy, terms_policy)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CASE WHEN $13 THEN now() END,
             $14, $15, CASE WHEN $15 THEN now() END, $16, $17, $18)
             RETURNING id, slug, display_name, description, province, municipality, status, is_verified,
             logo_media_asset_id, cover_media_asset_id, delivery_policy, returns_policy, terms_policy,
             contact_email, contact_email_public, contact_phone, contact_phone_public,
             (mcx_phone_ciphertext IS NOT NULL) AS has_payment_destination`,
            [body.profileType, user.id, slugify(body.displayName), body.displayName.trim(), body.description.trim(), body.province.trim(), body.municipality.trim(), nameCipher, phoneCipher, body.logoImageId ?? null, body.coverImageId ?? null, contactEmail, Boolean(body.contactEmailPublic), contactPhone, Boolean(body.contactPhonePublic), body.deliveryPolicy?.trim() ?? "", body.returnsPolicy?.trim() ?? "", body.termsPolicy?.trim() ?? ""],
          );
          await client.query("INSERT INTO store_memberships (seller_profile_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING", [profile.rows[0].id, user.id]);
        }
        await this.syncPaymentMethods(client, profile.rows[0].id as string, body);
        await client.query(
          "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'store.profile.saved', 'store', $2)",
          [user.id, profile.rows[0].id],
        );
        return profile.rows[0];
      });
      return this.getProfile(user);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") throw new ConflictException({ code: "STORE_NAME_CONFLICT", message: "Não foi possível criar esta montra. Tenta outro nome." });
      throw error;
    }
  }

  private async syncPaymentMethods(client: import("pg").PoolClient, sellerProfileId: string, body: StoreDto) {
    if (body.clearPaymentDestination) {
      const pendingLegacyOrders = await client.query(
        `SELECT 1 FROM orders WHERE seller_profile_id = $1 AND payment_method = 'manual_multicaixa_express_transfer'
         AND payment_destination_ciphertext IS NULL AND payment_status IN ('awaiting_transfer', 'buyer_reported') LIMIT 1`,
        [sellerProfileId],
      );
      if (pendingLegacyOrders.rowCount) {
        throw new ConflictException({ code: "PENDING_MCX_ORDERS", message: "Termina as encomendas MCX pendentes antes de apagar estes dados." });
      }
      await client.query("DELETE FROM seller_payment_methods WHERE seller_profile_id = $1 AND method = 'manual_multicaixa_express_transfer'", [sellerProfileId]);
    } else {
      const legacyMcx = await client.query<{ mcx_recipient_name_ciphertext: string | null; mcx_phone_ciphertext: string | null }>(
        "SELECT mcx_recipient_name_ciphertext, mcx_phone_ciphertext FROM seller_profiles WHERE id = $1 FOR UPDATE",
        [sellerProfileId],
      );
      const method = await client.query<{ enabled: boolean }>(
        "SELECT enabled FROM seller_payment_methods WHERE seller_profile_id = $1 AND method = 'manual_multicaixa_express_transfer' FOR UPDATE",
        [sellerProfileId],
      );
      const recipientNameCiphertext = legacyMcx.rows[0]?.mcx_recipient_name_ciphertext;
      const phoneCiphertext = legacyMcx.rows[0]?.mcx_phone_ciphertext;
      const currentEnabled = method.rows[0]?.enabled ?? Boolean(recipientNameCiphertext && phoneCiphertext);
      const mcxConfigurationChanged = Boolean(body.clearPaymentDestination || body.mcxRecipientName?.trim() || body.mcxPhone?.trim())
        || (body.mcxEnabled !== undefined && body.mcxEnabled !== currentEnabled);
      if (mcxConfigurationChanged) {
        const pendingLegacyOrders = await client.query(
          `SELECT 1 FROM orders WHERE seller_profile_id = $1 AND payment_method = 'manual_multicaixa_express_transfer'
           AND payment_destination_ciphertext IS NULL AND payment_status IN ('awaiting_transfer', 'buyer_reported') LIMIT 1`,
          [sellerProfileId],
        );
        if (pendingLegacyOrders.rowCount) {
          throw new ConflictException({ code: "PENDING_MCX_ORDERS", message: "Termina as encomendas MCX pendentes antes de alterar ou desativar estes dados." });
        }
      }
      if (recipientNameCiphertext && phoneCiphertext) {
        const enabled = body.mcxEnabled ?? method.rows[0]?.enabled ?? true;
        await client.query(
          `INSERT INTO seller_payment_methods (
             seller_profile_id, method, enabled, recipient_name_ciphertext, recipient_identifier_ciphertext
           ) VALUES ($1, 'manual_multicaixa_express_transfer', $2, $3, $4)
           ON CONFLICT (seller_profile_id, method) DO UPDATE SET
             enabled = EXCLUDED.enabled,
             recipient_name_ciphertext = EXCLUDED.recipient_name_ciphertext,
             recipient_identifier_ciphertext = EXCLUDED.recipient_identifier_ciphertext,
             updated_at = now()`,
          [sellerProfileId, enabled, recipientNameCiphertext, phoneCiphertext],
        );
      } else {
        if (body.mcxEnabled) throw new BadRequestException({ code: "MCX_DETAILS_REQUIRED", message: "Indica o nome e o número antes de ativares o Multicaixa Express." });
        await client.query("DELETE FROM seller_payment_methods WHERE seller_profile_id = $1 AND method = 'manual_multicaixa_express_transfer'", [sellerProfileId]);
      }
    }

    if (body.clearBankTransfer) {
      await client.query("DELETE FROM seller_payment_methods WHERE seller_profile_id = $1 AND method = 'manual_bank_transfer'", [sellerProfileId]);
      return;
    }

    const existingBank = await client.query<{
      enabled: boolean;
      recipient_name_ciphertext: string;
      recipient_identifier_ciphertext: string;
      provider_name_ciphertext: string;
    }>(
      `SELECT enabled, recipient_name_ciphertext, recipient_identifier_ciphertext, provider_name_ciphertext
       FROM seller_payment_methods WHERE seller_profile_id = $1 AND method = 'manual_bank_transfer' FOR UPDATE`,
      [sellerProfileId],
    );
    const suppliedBankFields = [body.bankName?.trim(), body.bankAccountHolder?.trim(), body.bankAccountIdentifier?.replace(/\s/g, "").toUpperCase()];
    if (suppliedBankFields.some(Boolean)) {
      const storedBankFields = existingBank.rows[0]
        ? [
            decryptPrivateValue(existingBank.rows[0].provider_name_ciphertext),
            decryptPrivateValue(existingBank.rows[0].recipient_name_ciphertext),
            decryptPrivateValue(existingBank.rows[0].recipient_identifier_ciphertext),
          ]
        : [null, null, null];
      const bankFields = suppliedBankFields.map((value, index) => value || storedBankFields[index]);
      if (bankFields.some((value) => !value)) {
        throw new BadRequestException({ code: "BANK_TRANSFER_FIELDS_REQUIRED_TOGETHER", message: "Indica o banco, o titular e o IBAN ou número de conta juntos." });
      }
      const enabled = body.bankTransferEnabled ?? existingBank.rows[0]?.enabled ?? true;
      await client.query(
        `INSERT INTO seller_payment_methods (
           seller_profile_id, method, enabled, provider_name_ciphertext, recipient_name_ciphertext, recipient_identifier_ciphertext
         ) VALUES ($1, 'manual_bank_transfer', $2, $3, $4, $5)
         ON CONFLICT (seller_profile_id, method) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           provider_name_ciphertext = EXCLUDED.provider_name_ciphertext,
           recipient_name_ciphertext = EXCLUDED.recipient_name_ciphertext,
           recipient_identifier_ciphertext = EXCLUDED.recipient_identifier_ciphertext,
           updated_at = now()`,
        [sellerProfileId, enabled, encryptPrivateValue(bankFields[0]!), encryptPrivateValue(bankFields[1]!), encryptPrivateValue(bankFields[2]!)],
      );
    } else if (existingBank.rowCount) {
      if (body.bankTransferEnabled !== undefined) {
        await client.query(
          "UPDATE seller_payment_methods SET enabled = $2, updated_at = now() WHERE seller_profile_id = $1 AND method = 'manual_bank_transfer'",
          [sellerProfileId, body.bankTransferEnabled],
        );
      }
    } else if (body.bankTransferEnabled) {
      throw new BadRequestException({ code: "BANK_TRANSFER_DETAILS_REQUIRED", message: "Indica o banco, o titular e o IBAN ou número de conta antes de ativares a transferência bancária." });
    }
  }

  private async storeForMember(user: AuthenticatedUser, roles: readonly string[]) {
    const store = await this.context.find(user);
    return store?.status === 'active' && roles.includes(store.role) ? store : null;
  }
  private async ownerStoreId(user: AuthenticatedUser) { return this.context.owner(user); }
  private async listingContext(body: ListingDto) {
    const marketplace = body.marketplace ?? "produtos";
    const attributes = parseListingAttributes(marketplace, body.attributes);
    if (!attributes.ok) {
      throw new BadRequestException({ code: attributes.code, message: attributes.message, field: attributes.field });
    }
    const category = await this.database.query<{ id: string }>(
      `SELECT c.id FROM categories c JOIN marketplaces m ON m.id = c.marketplace_id
       WHERE c.slug = $1 AND c.is_active AND m.slug = $2 AND m.status = 'active'`,
      [body.categorySlug, marketplace],
    );
    if (!category.rowCount) throw new BadRequestException({ code: "INVALID_CATEGORY", message: "Escolhe uma categoria disponível." });
    return {
      categoryId: category.rows[0].id,
      attributes: JSON.stringify(attributes.value),
      condition: marketplace === "empresas" ? "new" : body.condition,
      availableQuantity: marketplace === "produtos" ? body.availableQuantity : 1,
    };
  }
  @Get("team")
  async getTeam(@CurrentUser() user: AuthenticatedUser) {
    const storeId = await this.ownerStoreId(user);
    if (!storeId) return { items: [] };
    const result = await this.database.query(
      `SELECT u.id AS user_id, u.display_name, u.email, sm.role, sm.created_at
       FROM store_memberships sm JOIN users u ON u.id = sm.user_id
       WHERE sm.seller_profile_id = $1
       ORDER BY CASE sm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.display_name LIMIT 50`,
      [storeId],
    );
    return { items: result.rows };
  }

  @Post("team")
  addTeamMember() { throw new BadRequestException({code:"INVITATION_REQUIRED",message:"Envia um convite em /seller/invitations. O acesso exige aceitação."}); }
  @Put("team/:userId")
  async updateTeamMember(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) memberId: string,
    @Body() body: StoreMemberRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const storeId = await this.ownerStoreId(user);
    if (!storeId) throw new ForbiddenException({ code: "STORE_OWNER_REQUIRED", message: "Só o proprietário pode gerir a equipa." });
    return this.database.transaction(async (client) => {
    const result = await client.query(
      `UPDATE store_memberships sm SET role = $3
       FROM seller_profiles s
       WHERE sm.seller_profile_id = s.id AND s.owner_user_id = $1 AND s.status = 'active'
         AND sm.user_id = $2 AND sm.role <> 'owner' AND s.id = $4 AND sm.user_id <> s.owner_user_id
       RETURNING sm.user_id, sm.role`,
      [user.id, memberId, body.role, storeId],
    );
    if (!result.rowCount) throw new NotFoundException({ code: "STORE_MEMBER_NOT_FOUND", message: "Membro não encontrado nesta loja." });
    await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'store.member.updated', 'store', $2)", [user.id, storeId]);
    return result.rows[0];
    });
  }

  @Delete("team/:userId")
  async removeTeamMember(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const storeId = await this.ownerStoreId(user);
    if (!storeId) throw new ForbiddenException({ code: "STORE_OWNER_REQUIRED", message: "Só o proprietário pode gerir a equipa." });
    return this.database.transaction(async (client) => {
    const result = await client.query(
      `DELETE FROM store_memberships sm USING seller_profiles s
       WHERE sm.seller_profile_id = s.id AND s.owner_user_id = $1 AND s.status = 'active'
         AND sm.user_id = $2 AND sm.role <> 'owner' AND s.id = $3 AND sm.user_id <> s.owner_user_id
       RETURNING sm.seller_profile_id`,
      [user.id, memberId, storeId],
    );
    if (!result.rowCount) throw new NotFoundException({ code: "STORE_MEMBER_NOT_FOUND", message: "Membro não encontrado nesta loja." });
    await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'store.member.removed', 'store', $2)", [user.id, result.rows[0].seller_profile_id]);
    return { removed: true };
    });
  }

  @Get("listings")
  async myListings(@CurrentUser() user: AuthenticatedUser) {
    const store = await this.storeForMember(user, ["owner", "editor", "support"]);
    if (!store) return { items: [] };
    const result = await this.database.query(
      `SELECT l.id, l.slug, l.title, l.price::text, l.available_quantity, l.status, l.rejection_reason, l.updated_at,
              m.slug AS marketplace, m.name AS marketplace_name, c.name AS category,
              ${`COALESCE((SELECT json_agg(json_build_object('url', li.image_url, 'alt', li.alt_text) ORDER BY li.sort_order) FROM listing_images li WHERE li.listing_id = l.id), '[]'::json) AS images`}
       FROM listings l JOIN categories c ON c.id = l.category_id JOIN marketplaces m ON m.id = c.marketplace_id
       WHERE l.seller_profile_id = $1 ORDER BY l.updated_at DESC LIMIT 100`,
      [store.id],
    );
    return { items: result.rows };
  }

  @Get("listings/:id")
  async myListing(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const selected = await this.storeForMember(user, ['owner','editor']);
    if (!selected) throw new ForbiddenException('Seleciona uma loja com permissão de edição.');
    const result = await this.database.query(
      `SELECT l.id, l.slug, l.title, l.description, l.price::text, l.condition, l.price_negotiable,
              l.available_quantity, l.province, l.municipality, l.status, l.attributes,
              m.slug AS marketplace, c.slug AS category_slug,
              COALESCE((SELECT json_agg(json_build_object('id', li.media_asset_id, 'url', li.image_url, 'alt', li.alt_text) ORDER BY li.sort_order) FROM listing_images li WHERE li.listing_id = l.id), '[]'::json) AS images
       FROM listings l JOIN categories c ON c.id = l.category_id JOIN marketplaces m ON m.id = c.marketplace_id JOIN store_memberships sm ON sm.seller_profile_id = l.seller_profile_id
       WHERE l.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND l.seller_profile_id=$3`, [id, user.id, selected.id],
    );
    if (!result.rowCount) throw new BadRequestException({ code: "LISTING_NOT_FOUND", message: "Anúncio não encontrado." });
    return result.rows[0];
  }

  @Post("listings")
  async createListing(@Body() body: ListingDto, @CurrentUser() user: AuthenticatedUser) {
    const profile = await this.storeForMember(user, ["owner", "editor"]);
    if (!profile) {
      const membership = await this.database.query("SELECT 1 FROM store_memberships WHERE user_id = $1 LIMIT 1", [user.id]);
      if (membership.rowCount) throw new ForbiddenException({ code: "STORE_LISTING_PERMISSION_REQUIRED", message: "O teu papel na loja não permite gerir anúncios." });
      throw new BadRequestException({ code: "STORE_PROFILE_REQUIRED", message: "Completa primeiro o perfil da tua loja." });
    }
    const context = await this.listingContext(body);
    const imageIds = [...new Set(body.imageIds ?? [])];

    // Moderação preliminar via IA
    const aiMod = await this.aiClient.moderateContent({
      title: body.title,
      description: body.description,
      price: body.price,
    });
    const isAutoRejected = aiMod.action === "auto_reject";
    const initialStatus = isAutoRejected ? "rejected" : "pending_review";
    const rejectionReason = isAutoRejected ? aiMod.flaggedReasons.join(". ") : null;

    const id = await this.database.transaction(async (client) => {
      const listing = await client.query<{ id: string; slug: string }>(
        `INSERT INTO listings (seller_profile_id, category_id, slug, title, description, price, condition, price_negotiable, available_quantity, status, rejection_reason, province, municipality, ai_risk_score, ai_flagged_reasons, ai_suggested_action, attributes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id, slug`,
        [
          profile.id,
          context.categoryId,
          slugify(body.title),
          body.title.trim(),
          body.description.trim(),
          body.price,
          context.condition,
          Boolean(body.priceNegotiable),
          context.availableQuantity,
          initialStatus,
          rejectionReason,
          body.province.trim(),
          body.municipality.trim(),
          aiMod.riskScore,
          aiMod.flaggedReasons,
          aiMod.suggestedModeratorAction ?? null,
          context.attributes,
        ],
      );
      for (let i = 0; i < imageIds.length; i++) {
        const asset = await client.query("SELECT id FROM media_assets WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL", [imageIds[i], user.id]);
        if (!asset.rowCount) throw new BadRequestException({ code: "INVALID_IMAGE", message: "Uma das imagens não está disponível." });
        await client.query("INSERT INTO listing_images (listing_id, media_asset_id, image_url, alt_text, sort_order) VALUES ($1, $2, $3, $4, $5)", [listing.rows[0].id, imageIds[i], `/api/v1/media/${imageIds[i]}`, body.title.trim(), i]);
      }
      const auditAction = isAutoRejected ? "listing.ai_auto_rejected" : "listing.created";
      await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'listing', $3)", [user.id, auditAction, listing.rows[0].id]);
      return listing.rows[0];
    });

    if (aiMod.riskScore >= 70 || isAutoRejected) {
      this.moderationAlerts.emitAlert({
        type: "high_risk_listing",
        entityId: id.id,
        title: body.title.trim(),
        riskScore: aiMod.riskScore,
        reasons: aiMod.flaggedReasons,
        suggestedAction: aiMod.suggestedModeratorAction ?? undefined,
      });
    }

    return { ...id, status: initialStatus, rejectionReason };
  }

  @Put("listings/:id")
  async updateListing(@Param("id") id: string, @Body() body: ListingDto, @CurrentUser() user: AuthenticatedUser) {
    const selected = await this.storeForMember(user, ['owner','editor']);
    if (!selected) throw new ForbiddenException('Seleciona uma loja com permissão de edição.');
    const context = await this.listingContext(body);
    const imageIds = [...new Set(body.imageIds ?? [])];

    const aiMod = await this.aiClient.moderateContent({
      title: body.title,
      description: body.description,
      price: body.price,
    });
    const isAutoRejected = aiMod.action === "auto_reject";
    const status = isAutoRejected ? "rejected" : "pending_review";
    const rejectionReason = isAutoRejected ? aiMod.flaggedReasons.join(". ") : null;

    const result = await this.database.transaction(async (client) => {
      const owns = await client.query<{ id: string }>(
        `SELECT l.id FROM listings l JOIN store_memberships sm ON sm.seller_profile_id = l.seller_profile_id
         JOIN seller_profiles s ON s.id = l.seller_profile_id
         WHERE l.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND s.status = 'active' AND s.id=$3 FOR UPDATE OF l`, [id, user.id, selected.id],
      );
      if (!owns.rowCount) throw new BadRequestException({ code: "LISTING_NOT_FOUND", message: "Anúncio não encontrado." });
      await client.query(
        `UPDATE listings SET category_id = $2, title = $3, description = $4, price = $5, condition = $6, price_negotiable = $7,
         available_quantity = $8, status = $9, rejection_reason = $10, province = $11, municipality = $12,
         ai_risk_score = $13, ai_flagged_reasons = $14, ai_suggested_action = $15, attributes = $16::jsonb, updated_at = now()
         WHERE id = $1`,
        [
          id,
          context.categoryId,
          body.title.trim(),
          body.description.trim(),
          body.price,
          context.condition,
          Boolean(body.priceNegotiable),
          context.availableQuantity,
          status,
          rejectionReason,
          body.province.trim(),
          body.municipality.trim(),
          aiMod.riskScore,
          aiMod.flaggedReasons,
          aiMod.suggestedModeratorAction ?? null,
          context.attributes,
        ],
      );
      const existingImages = await client.query<{ media_asset_id: string }>("SELECT media_asset_id FROM listing_images WHERE listing_id = $1", [id]);
      const retainedImages = new Set(existingImages.rows.map((image) => image.media_asset_id));
      await client.query("DELETE FROM listing_images WHERE listing_id = $1", [id]);
      for (let i = 0; i < imageIds.length; i++) {
        const asset = await client.query("SELECT id FROM media_assets WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL", [imageIds[i], user.id]);
        if (!asset.rowCount && !retainedImages.has(imageIds[i])) throw new BadRequestException({ code: "INVALID_IMAGE", message: "Uma das imagens não está disponível." });
        await client.query("INSERT INTO listing_images (listing_id, media_asset_id, image_url, alt_text, sort_order) VALUES ($1, $2, $3, $4, $5)", [id, imageIds[i], `/api/v1/media/${imageIds[i]}`, body.title.trim(), i]);
      }
      const auditAction = isAutoRejected ? "listing.ai_auto_rejected" : "listing.updated";
      await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'listing', $3)", [user.id, auditAction, id]);
      return { id, status, rejectionReason };
    });

    if (aiMod.riskScore >= 70 || isAutoRejected) {
      this.moderationAlerts.emitAlert({
        type: "high_risk_listing",
        entityId: id,
        title: body.title.trim(),
        riskScore: aiMod.riskScore,
        reasons: aiMod.flaggedReasons,
        suggestedAction: aiMod.suggestedModeratorAction ?? undefined,
      });
    }

    return result;
  }

  @Patch("listings/:id/status")
  async setListingStatus(@Param("id") id: string, @Body() body: ListingStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const selected = await this.storeForMember(user, ['owner','editor']);
    if (!selected) throw new ForbiddenException('Seleciona uma loja com permissão de edição.');
    const result = await this.database.query(
      `UPDATE listings l SET status = $3, updated_at = now()
       FROM store_memberships sm JOIN seller_profiles s ON s.id = sm.seller_profile_id
       WHERE l.seller_profile_id = sm.seller_profile_id AND l.id = $1 AND sm.user_id = $2
         AND sm.role IN ('owner', 'editor') AND s.status = 'active' AND s.id=$4 AND l.status IN ('published', 'paused') RETURNING l.id, l.status`,
      [id, user.id, body.status, selected.id],
    );
    if (!result.rowCount) throw new BadRequestException({ code: "LISTING_NOT_FOUND", message: "Anúncio não encontrado ou sem permissão." });
    return result.rows[0];
  }
}
