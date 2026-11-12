-- Opcional (busca por raio). Aplicar manualmente no MySQL 8 após `prisma db push`/migrate.
-- Coluna gerada a partir de lat/lng + índice espacial. Colunas geradas exigem NOT NULL para índice SPATIAL,
-- por isso o índice só cobre imóveis geocodificados (usar tabela auxiliar ou preencher com POINT(0 0) e filtrar).
ALTER TABLE Property ADD COLUMN geo POINT SRID 4326 NULL;
UPDATE Property SET geo = ST_SRID(POINT(lng, lat), 4326) WHERE lat IS NOT NULL AND lng IS NOT NULL;
-- Consulta de exemplo (raio de 5 km):
-- SELECT id FROM Property WHERE ST_Distance_Sphere(geo, ST_SRID(POINT(:lng, :lat), 4326)) <= 5000;
