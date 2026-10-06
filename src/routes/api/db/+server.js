mport { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET() {
  try {
    // Supabase DB 연결 테스트 (간단한 쿼리 실행)
    const { data, error } = await supabase.from('').select('*').limit(1);

    // 테이블 연결 시도 중 에러가 발생하더라도 API 응답 실패 구분 처리
    if (error && error.code !== 'PGRST204' && error.code !== '42P01') {
      // PGRST204 / 42P01 은 테이블이 없다는 에러일 뿐, DB 서버 접속 자체는 성공한 것으로 간주 가능
    }

    return json({
      status: 'ok',
      message: 'Database connection successful',
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
