import os
from dotenv import load_dotenv
import psycopg

load_dotenv(override=True)
db_url = os.getenv('SUPABASE_DB_URL')

sql = """
CREATE TABLE IF NOT EXISTS public.test_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON TABLE public.test_records TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

ALTER TABLE public.test_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for anon and authenticated" ON public.test_records;
CREATE POLICY "Allow all operations for anon and authenticated" 
ON public.test_records 
FOR ALL 
USING (true) 
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
"""

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute(sql)
        conn.commit()
        print('PostgreSQL 스키마 및 권한, 캐시 갱신 성공!')
