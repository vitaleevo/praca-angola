import { describe, expect, it } from "vitest";
import { parseListingAttributes } from "./listing-attributes";

describe("parseListingAttributes", () => {
  it("ignores attributes for product and service listings", () => {
    expect(parseListingAttributes("produtos", { bedrooms: 3 })).toEqual({ ok: true, value: {} });
    expect(parseListingAttributes("servicos", { make: "Toyota" })).toEqual({ ok: true, value: {} });
  });

  it("sanitizes a valid property listing", () => {
    expect(parseListingAttributes("imoveis", {
      transaction: "venda",
      bedrooms: "3",
      bathrooms: 2,
      areaM2: "125.5",
      parking: "1",
      furnished: "true",
      extra: "ignored",
    })).toEqual({
      ok: true,
      value: { transaction: "venda", bedrooms: 3, bathrooms: 2, areaM2: 125.5, parking: 1, furnished: true },
    });
  });

  it("requires the transaction and area for property listings", () => {
    expect(parseListingAttributes("imoveis", { areaM2: 100 })).toMatchObject({ ok: false, field: "transaction" });
    expect(parseListingAttributes("imoveis", { transaction: "venda" })).toMatchObject({ ok: false, field: "areaM2" });
  });

  it("rejects invalid property values", () => {
    expect(parseListingAttributes("imoveis", { transaction: "troca", areaM2: 100 })).toMatchObject({ ok: false, field: "transaction" });
    expect(parseListingAttributes("imoveis", { transaction: "venda", areaM2: 0 })).toMatchObject({ ok: false, field: "areaM2" });
    expect(parseListingAttributes("imoveis", { transaction: "venda", areaM2: 80, bedrooms: -1 })).toMatchObject({ ok: false, field: "bedrooms" });
  });

  it("sanitizes a valid vehicle listing", () => {
    expect(parseListingAttributes("automoveis", {
      make: " Toyota ",
      model: "Hilux",
      year: "2021",
      mileageKm: "85000",
      fuel: "gasoleo",
      transmission: "automatica",
      color: "Branco",
      extra: true,
    })).toEqual({
      ok: true,
      value: { make: "Toyota", model: "Hilux", year: 2021, mileageKm: 85000, fuel: "gasoleo", transmission: "automatica", color: "Branco" },
    });
  });

  it("rejects vehicles outside the supported year range", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(parseListingAttributes("automoveis", { make: "Toyota", model: "Hilux", year: 1900, fuel: "gasoleo" })).toMatchObject({ ok: false, field: "year" });
    expect(parseListingAttributes("automoveis", { make: "Toyota", model: "Hilux", year: nextYear + 1, fuel: "gasoleo" })).toMatchObject({ ok: false, field: "year" });
    expect(parseListingAttributes("automoveis", { make: "Toyota", model: "Hilux", year: 2020, fuel: "gasoleo", mileageKm: -5 })).toMatchObject({ ok: false, field: "mileageKm" });
  });

  it("sanitizes a valid company listing", () => {
    expect(parseListingAttributes("empresas", {
      companyType: "fornecedor",
      sector: " Construção ",
      coverage: "Luanda e Benguela",
      delivery: "true",
      website: "empresa.ao",
      extra: "ignored",
    })).toEqual({
      ok: true,
      value: { companyType: "fornecedor", sector: "Construção", coverage: "Luanda e Benguela", delivery: true, website: "https://empresa.ao" },
    });
  });

  it("rejects invalid company values", () => {
    expect(parseListingAttributes("empresas", { companyType: "outro", sector: "Construção" })).toMatchObject({ ok: false, field: "companyType" });
    expect(parseListingAttributes("empresas", { companyType: "loja", sector: "" })).toMatchObject({ ok: false, field: "sector" });
    expect(parseListingAttributes("empresas", { companyType: "loja", sector: "Construção", website: "javascript:alert(1)" })).toMatchObject({ ok: false, field: "website" });
  });

  it("rejects non-object attributes for verticals with fields", () => {
    expect(parseListingAttributes("imoveis", [])).toMatchObject({ ok: false });
    expect(parseListingAttributes("automoveis", "Toyota")).toMatchObject({ ok: false });
  });
});
