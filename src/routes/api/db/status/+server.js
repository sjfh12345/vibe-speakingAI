import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET() {
  try {
    // Supabase 헬스체크 쿼리 (auth.users 또는 간단한 연결 테스트)
    const { data, error } = await supabase.from('').select('*').limit(1);

    // 테이블이 없다는 에러(42P01/PGRST204)도 DB 서버 연결 자체는 성공으로 간주
    if (error && error.code !== 'PGRST204' && error.code !== '42P01') {
      throw error;
    }

    return json({
      status: 'ok',
      message: 'Database connection verified via Supabase SDK',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return json(
      {
        status: 'error',
        message: err.message || 'Database connection failed'
      },
      { status: 500 }
    );
  }
}
