// test.js
// 模拟前端调用后端 API，验证服务器是否正常响应

const BASE_URL = 'http://localhost:3000';

async function testGetStatus() {
  console.log('\n🧪 Testing GET /api/game/status ...');
  try {
    const res = await fetch(`${BASE_URL}/api/game/status`);
    const data = await res.json();
    console.log('✅ GET response:', data);
  } catch (err) {
    console.error('❌ GET failed:', err.message);
  }
}

async function testPostMove() {
  console.log('\n🧪 Testing POST /api/game/move ...');
  try {
    const res = await fetch(`${BASE_URL}/api/game/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ targetTile: 5 })
    });
    const data = await res.json();
    console.log('✅ POST response:', data);
  } catch (err) {
    console.error('❌ POST failed:', err.message);
  }
}

async function runTests() {
  console.log('🚀 Starting API tests...');
  await testGetStatus();
  await testPostMove();
  console.log('\n🏁 Tests completed.');
}

runTests();