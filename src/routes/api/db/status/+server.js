import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET() {
  try {
    // 빈 테이블 이름 대신 수동 연결 테스트 진행
    const { data, error } = await supabase.from('users').select('id').limit(1);

    // 테이블이 없다는 에러(PGRST204, 42P01, PGRST116)가 나더라도 API 연결 통신 자체는 성공으로 간주
    if (error && !['PGRST204', '42P01', 'PGRST116'].includes(error.code)) {
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
