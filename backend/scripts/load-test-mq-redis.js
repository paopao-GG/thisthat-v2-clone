/**
 * Load Test: Message Queue & Redis Scalability
 *
 * Tests:
 * 1. MQ reliability under load (1k-10k concurrent tasks)
 * 2. Redis cluster performance
 * 3. Rate limiting effectiveness
 * 4. Dead-letter queue handling
 * 5. Concurrent user simulation
 */

import 'dotenv/config';
import { createClient } from 'redis';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CONCURRENT_USERS = [100, 500, 1000, 5000, 10000];
const TASKS_PER_USER = 10;

class LoadTester {
  constructor() {
    this.results = {
      redis: { main: {}, rateLimit: {} },
      mq: {},
      concurrent: {},
    };
  }

  // Initialize Redis clients
  async initRedis() {
    console.log('\n═══ Initializing Redis Clients ═══\n');

    // Main Redis client (redis v5)
    this.mainRedis = createClient({ url: REDIS_URL });
    await this.mainRedis.connect();
    console.log('✅ Main Redis connected');

    // Rate limit Redis client (ioredis)
    this.rateLimitRedis = new Redis(REDIS_URL);
    await new Promise((resolve) => {
      this.rateLimitRedis.on('ready', resolve);
    });
    console.log('✅ Rate Limit Redis connected');
  }

  // Test 1: Redis Performance under load
  async testRedisPerformance() {
    console.log('\n═══ Test 1: Redis Performance ═══\n');

    const operations = [
      { name: 'SET', count: 10000, op: (i) => this.mainRedis.set(`test:${i}`, `value${i}`) },
      { name: 'GET', count: 10000, op: (i) => this.mainRedis.get(`test:${i}`) },
      { name: 'DEL', count: 10000, op: (i) => this.mainRedis.del(`test:${i}`) },
      { name: 'INCR', count: 10000, op: (i) => this.mainRedis.incr(`counter:${i % 100}`) },
      { name: 'LPUSH', count: 5000, op: (i) => this.mainRedis.lPush(`queue:${i % 10}`, `task${i}`) },
      { name: 'LPOP', count: 5000, op: (i) => this.mainRedis.lPop(`queue:${i % 10}`) },
    ];

    for (const { name, count, op } of operations) {
      const start = Date.now();
      const errors = [];

      // Concurrent execution
      const promises = Array.from({ length: count }, (_, i) =>
        op(i).catch((err) => errors.push(err))
      );

      await Promise.all(promises);
      const duration = Date.now() - start;
      const opsPerSec = Math.round((count / duration) * 1000);

      this.results.redis.main[name] = {
        operations: count,
        duration: `${duration}ms`,
        opsPerSecond: opsPerSec,
        errors: errors.length,
        success: count - errors.length,
      };

      console.log(`${name.padEnd(10)} ${count.toLocaleString().padStart(7)} ops in ${duration}ms → ${opsPerSec.toLocaleString()} ops/sec ${errors.length > 0 ? `⚠️  ${errors.length} errors` : '✅'}`);
    }
  }

  // Test 2: Rate Limiting Redis Performance
  async testRateLimitRedis() {
    console.log('\n═══ Test 2: Rate Limiting Redis ═══\n');

    const users = 1000;
    const requestsPerUser = 100;
    const start = Date.now();
    const errors = [];

    const promises = [];
    for (let user = 0; user < users; user++) {
      for (let req = 0; req < requestsPerUser; req++) {
        promises.push(
          this.rateLimitRedis
            .incr(`rate:user:${user}:${Math.floor(Date.now() / 1000)}`)
            .catch((err) => errors.push(err))
        );
      }
    }

    await Promise.all(promises);
    const duration = Date.now() - start;
    const total = users * requestsPerUser;
    const opsPerSec = Math.round((total / duration) * 1000);

    this.results.redis.rateLimit = {
      users,
      requestsPerUser,
      total,
      duration: `${duration}ms`,
      opsPerSecond: opsPerSec,
      errors: errors.length,
    };

    console.log(`Users:     ${users.toLocaleString()}`);
    console.log(`Requests:  ${total.toLocaleString()}`);
    console.log(`Duration:  ${duration}ms`);
    console.log(`Speed:     ${opsPerSec.toLocaleString()} ops/sec`);
    console.log(`Errors:    ${errors.length} ${errors.length > 0 ? '⚠️' : '✅'}`);
  }

  // Test 3: Message Queue Reliability
  async testMessageQueue() {
    console.log('\n═══ Test 3: Message Queue Reliability ═══\n');

    const scenarios = [
      { name: 'Small Load', tasks: 100 },
      { name: 'Medium Load', tasks: 1000 },
      { name: 'High Load', tasks: 5000 },
      { name: 'Extreme Load', tasks: 10000 },
    ];

    for (const { name, tasks } of scenarios) {
      console.log(`\n${name} (${tasks.toLocaleString()} tasks):`);

      const queueKey = `test:queue:${Date.now()}`;
      const start = Date.now();
      const errors = [];

      // Enqueue tasks
      const enqueuePromises = Array.from({ length: tasks }, (_, i) =>
        this.mainRedis
          .rPush(queueKey, JSON.stringify({ id: i, data: `task${i}` }))
          .catch((err) => errors.push(err))
      );

      await Promise.all(enqueuePromises);
      const enqueueTime = Date.now() - start;

      // Dequeue tasks
      const dequeueStart = Date.now();
      const dequeuePromises = Array.from({ length: tasks }, () =>
        this.mainRedis.lPop(queueKey).catch((err) => errors.push(err))
      );

      const dequeued = await Promise.all(dequeuePromises);
      const dequeueTime = Date.now() - dequeueStart;

      const successful = dequeued.filter((x) => x !== null).length;

      this.results.mq[name] = {
        tasks,
        enqueueTime: `${enqueueTime}ms`,
        dequeueTime: `${dequeueTime}ms`,
        totalTime: `${enqueueTime + dequeueTime}ms`,
        successful,
        failed: tasks - successful,
        errors: errors.length,
        throughput: Math.round((tasks / (enqueueTime + dequeueTime)) * 1000),
      };

      console.log(`  Enqueue:   ${enqueueTime}ms`);
      console.log(`  Dequeue:   ${dequeueTime}ms`);
      console.log(`  Total:     ${enqueueTime + dequeueTime}ms`);
      console.log(`  Success:   ${successful}/${tasks} ${successful === tasks ? '✅' : '⚠️'}`);
      console.log(`  Throughput: ${Math.round((tasks / (enqueueTime + dequeueTime)) * 1000).toLocaleString()} tasks/sec`);
    }
  }

  // Test 4: Concurrent Users Simulation
  async testConcurrentUsers() {
    console.log('\n═══ Test 4: Concurrent Users Simulation ═══\n');

    for (const users of CONCURRENT_USERS) {
      console.log(`\n${users.toLocaleString()} concurrent users:`);

      const start = Date.now();
      const errors = [];
      const latencies = [];

      // Simulate user operations: GET user data, SET session, INCR counter
      const userPromises = Array.from({ length: users }, async (_, userId) => {
        const userStart = Date.now();
        try {
          await Promise.all([
            this.mainRedis.get(`user:${userId}`),
            this.mainRedis.setEx(`session:${userId}`, 900, `session${userId}`),
            this.mainRedis.incr(`counter:users`),
          ]);
          latencies.push(Date.now() - userStart);
        } catch (err) {
          errors.push(err);
        }
      });

      await Promise.all(userPromises);
      const duration = Date.now() - start;

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p50 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      this.results.concurrent[`${users} users`] = {
        users,
        operations: users * 3,
        duration: `${duration}ms`,
        avgLatency: `${avgLatency.toFixed(2)}ms`,
        p50: `${p50}ms`,
        p95: `${p95}ms`,
        p99: `${p99}ms`,
        errors: errors.length,
        throughput: Math.round((users * 3 / duration) * 1000),
      };

      console.log(`  Operations: ${(users * 3).toLocaleString()}`);
      console.log(`  Duration:   ${duration}ms`);
      console.log(`  Avg:        ${avgLatency.toFixed(2)}ms`);
      console.log(`  p50:        ${p50}ms`);
      console.log(`  p95:        ${p95}ms`);
      console.log(`  p99:        ${p99}ms`);
      console.log(`  Errors:     ${errors.length} ${errors.length > 0 ? '⚠️' : '✅'}`);
      console.log(`  Throughput: ${Math.round((users * 3 / duration) * 1000).toLocaleString()} ops/sec`);
    }
  }

  // Test 5: Dead-Letter Queue Handling
  async testDeadLetterQueue() {
    console.log('\n═══ Test 5: Dead-Letter Queue ═══\n');

    const queueKey = 'test:queue:dlq';
    const dlqKey = 'test:queue:dlq:dead';
    const tasks = 1000;
    const failureRate = 0.1; // 10% failure

    // Enqueue tasks
    for (let i = 0; i < tasks; i++) {
      await this.mainRedis.rPush(
        queueKey,
        JSON.stringify({
          id: i,
          shouldFail: Math.random() < failureRate,
        })
      );
    }

    let processed = 0;
    let failed = 0;

    // Process tasks
    while (true) {
      const task = await this.mainRedis.lPop(queueKey);
      if (!task) break;

      const { id, shouldFail } = JSON.parse(task);

      if (shouldFail) {
        await this.mainRedis.rPush(dlqKey, JSON.stringify({ id, error: 'Simulated failure' }));
        failed++;
      } else {
        processed++;
      }
    }

    const dlqLength = await this.mainRedis.lLen(dlqKey);

    console.log(`Total tasks:  ${tasks}`);
    console.log(`Processed:    ${processed} ✅`);
    console.log(`Failed:       ${failed}`);
    console.log(`In DLQ:       ${dlqLength} ${dlqLength === failed ? '✅' : '⚠️'}`);

    // Cleanup
    await this.mainRedis.del([queueKey, dlqKey]);
  }

  // Generate Report
  generateReport() {
    console.log('\n═══════════════════════════════════════');
    console.log('LOAD TEST SUMMARY REPORT');
    console.log('═══════════════════════════════════════\n');

    console.log('📊 Redis Performance:');
    console.log(JSON.stringify(this.results.redis.main, null, 2));

    console.log('\n⚡ Rate Limiting:');
    console.log(JSON.stringify(this.results.redis.rateLimit, null, 2));

    console.log('\n📨 Message Queue:');
    console.log(JSON.stringify(this.results.mq, null, 2));

    console.log('\n👥 Concurrent Users:');
    console.log(JSON.stringify(this.results.concurrent, null, 2));

    console.log('\n═══════════════════════════════════════');
    console.log('SCALABILITY ASSESSMENT');
    console.log('═══════════════════════════════════════\n');

    // Determine if system can handle 1k-10k users
    const canHandle = {
      '1k': false,
      '5k': false,
      '10k': false,
    };

    for (const [key, result] of Object.entries(this.results.concurrent)) {
      if (key.includes('1000') && result.errors === 0 && parseInt(result.p95) < 500) {
        canHandle['1k'] = true;
      }
      if (key.includes('5000') && result.errors === 0 && parseInt(result.p95) < 1000) {
        canHandle['5k'] = true;
      }
      if (key.includes('10000') && result.errors === 0 && parseInt(result.p95) < 2000) {
        canHandle['10k'] = true;
      }
    }

    console.log(`✅ 1,000 users:  ${canHandle['1k'] ? 'PASS' : 'FAIL'}`);
    console.log(`✅ 5,000 users:  ${canHandle['5k'] ? 'PASS' : 'FAIL'}`);
    console.log(`✅ 10,000 users: ${canHandle['10k'] ? 'PASS' : 'FAIL'}`);

    console.log('\n📝 Recommendations:');
    if (!canHandle['1k']) {
      console.log('⚠️  System struggling with 1k users - consider optimization');
    }
    if (!canHandle['5k']) {
      console.log('⚠️  Consider Redis clustering for >5k concurrent users');
    }
    if (!canHandle['10k']) {
      console.log('⚠️  Implement Redis cluster + read replicas for 10k+ users');
    }
    if (canHandle['1k'] && canHandle['5k'] && canHandle['10k']) {
      console.log('🎉 System is production-ready for 1k-10k concurrent users!');
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    await this.mainRedis.quit();
    await this.rateLimitRedis.quit();
    console.log('✅ Cleanup complete\n');
  }

  async run() {
    try {
      await this.initRedis();
      await this.testRedisPerformance();
      await this.testRateLimitRedis();
      await this.testMessageQueue();
      await this.testConcurrentUsers();
      await this.testDeadLetterQueue();
      this.generateReport();
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests
const tester = new LoadTester();
tester.run().catch(console.error);
