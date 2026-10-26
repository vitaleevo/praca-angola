-- P.U.V.O. vertical marketplaces: Empresas, Imóveis and Automóveis.
-- Listings keep the existing catalog/moderation flow; domain fields live in attributes.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS listings_attributes_gin_idx
  ON listings USING gin (attributes);

CREATE INDEX IF NOT EXISTS listings_attr_transaction_idx
  ON listings ((attributes->>'transaction')) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS listings_attr_company_type_idx
  ON listings ((attributes->>'companyType')) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS listings_attr_fuel_idx
  ON listings ((attributes->>'fuel')) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS listings_attr_year_idx
  ON listings (((attributes->>'year')::int)) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS listings_attr_bedrooms_idx
  ON listings (((attributes->>'bedrooms')::int)) WHERE status = 'published';

UPDATE marketplaces
SET status = 'active', updated_at = now()
WHERE slug IN ('empresas', 'imoveis', 'automoveis');

INSERT INTO categories (marketplace_id, name, slug, description, sort_order)
SELECT m.id, seed.name, seed.slug, seed.description, seed.sort_order
FROM marketplaces m
JOIN (VALUES
  ('empresas', 'Lojas e fornecedores', 'lojas-fornecedores', 'Lojas, fornecedores e grossistas para abastecer o teu negócio.', 1),
  ('empresas', 'Serviços empresariais', 'servicos-empresariais', 'Consultoria, contabilidade, formação e outros serviços para empresas.', 2),
  ('empresas', 'Equipamentos e materiais', 'equipamentos-materiais', 'Máquinas, ferramentas e materiais para operações e obras.', 3),
  ('empresas', 'Distribuição e logística', 'distribuicao-logistica', 'Transporte, armazenagem e distribuição em Angola.', 4),
  ('empresas', 'Tecnologia de escritório', 'tecnologia-escritorio', 'Computadores, impressão, redes e equipamento de escritório.', 5),
  ('empresas', 'Publicidade e marketing', 'publicidade-marketing', 'Comunicação, design, publicidade e marketing.', 6),
  ('imoveis', 'Apartamentos', 'apartamentos', 'Apartamentos para venda ou arrendamento.', 1),
  ('imoveis', 'Casas e moradias', 'casas-moradias', 'Casas e moradias para viver ou investir.', 2),
  ('imoveis', 'Terrenos', 'terrenos', 'Terrenos urbanos e rurais em toda Angola.', 3),
  ('imoveis', 'Escritórios e lojas', 'escritorios-lojas', 'Espaços comerciais para escritórios e lojas.', 4),
  ('imoveis', 'Armazéns', 'armazens', 'Armazéns e espaços logísticos.', 5),
  ('imoveis', 'Novos empreendimentos', 'novos-empreendimentos', 'Empreendimentos novos, em construção ou lançamento.', 6),
  ('automoveis', 'Carros', 'carros', 'Carros novos e usados de todas as marcas.', 1),
  ('automoveis', 'SUV e 4x4', 'suv-4x4', 'SUV, jipes e viaturas 4x4.', 2),
  ('automoveis', 'Comerciais', 'comerciais', 'Carrinhas, camiões e viaturas de trabalho.', 3),
  ('automoveis', 'Motas', 'motas', 'Motas, scooters e veículos de duas rodas.', 4),
  ('automoveis', 'Peças e acessórios', 'pecas-acessorios', 'Peças, pneus e acessórios automóveis.', 5),
  ('automoveis', 'Viaturas elétricas', 'viaturas-eletricas', 'Veículos elétricos e híbridos.', 6)
) AS seed(marketplace_slug, name, slug, description, sort_order)
  ON seed.marketplace_slug = m.slug
ON CONFLICT (marketplace_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  sort_order = EXCLUDED.sort_order;
