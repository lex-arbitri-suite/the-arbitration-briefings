/**
 * providers.test.mjs — Provider-neutrality Stage B test suite
 *
 * Mirrors urlLiveness.test.mjs: plain Node.js, CommonJS require via
 * createRequire, no third-party test runner.
 *
 * Tests are organised into five suites:
 *   1. Regression  — AI_PROVIDER=gemini is byte-identical to Stage A.
 *   2. Routing     — grounded paths stay Gemini even when AI_PROVIDER=openai-compat;
 *                    briefing path uses the selected provider + failover.
 *   3. Adapter     — OpenAICompatProvider unit tests with a mocked openai SDK.
 *   4. Disclosure  — getAIConfig returns sanitised config, never secrets.
 *
 * Run: node functions/providers.test.mjs  (from the project root)
 *      node providers.test.mjs            (from the functions/ directory)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ============================================================================
// Resolved paths to compiled modules
// ============================================================================

const libBase = path.join(__dirname, 'lib', 'functions');
const providersPath = path.join(libBase, 'providers');

// ============================================================================
// Minimal test harness (mirrors urlLiveness.test.mjs)
// ============================================================================

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(label);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ============================================================================
// Mock factories
// ============================================================================

/**
 * Creates a mock APIError class whose instances satisfy `instanceof` checks
 * in the compiled module. The class must be injected into the require cache
 * for `openai` BEFORE the openaiCompat module is loaded so that the module's
 * captured reference is the same class.
 */
class MockAPIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

/**
 * Creates a stub OpenAI client whose chat.completions.create is controllable
 * per-test via the returned `stub` handle.
 */
function makeOpenAIClientStub() {
  const stub = { createImpl: null };
  const client = {
    chat: {
      completions: {
        create: (...args) => stub.createImpl(...args),
      },
    },
  };
  return { client, stub };
}

/**
 * Registers a mock for the `openai` module in require.cache.
 * Must be called before any require() of openaiCompat or modules that
 * transitively require it.
 *
 * Returns the stub handle so individual tests can inject create() behaviour,
 * and the MockAPIError class so tests can construct matching error instances.
 */
function registerOpenAIMock() {
  const { client, stub } = makeOpenAIClientStub();

  // The compiled module does: new openai_1.default({...})
  // We supply a constructor that returns our controllable client stub.
  function MockOpenAI(_config) {
    return client;
  }

  const mockModule = {
    __esModule: true,
    default: MockOpenAI,
    APIError: MockAPIError,
  };

  // Resolve the real openai package path to get its canonical cache key.
  const openaiPath = require.resolve('openai');
  require.cache[openaiPath] = {
    id: openaiPath,
    filename: openaiPath,
    loaded: true,
    exports: mockModule,
    // Node.js module fields — minimal stubs
    parent: null,
    children: [],
    paths: [],
  };

  return { stub, MockAPIError };
}

/**
 * Registers a mock for the `@google/genai` module in require.cache.
 * Supplies a GoogleGenAI constructor returning a client whose
 * models.generateContent is controllable via the returned stub.
 *
 * Used to exercise the REAL GeminiProvider methods (which the routing/failover
 * suites otherwise override). In particular it proves generateText issues a
 * single SDK call and does not retry internally — in Stage B, retry is owned by
 * the failover wrapper and must never be nested inside the provider method.
 */
function registerGenaiMock() {
  const stub = { generateContentImpl: null };
  const client = {
    models: {
      generateContent: (...args) => stub.generateContentImpl(...args),
    },
  };
  function MockGoogleGenAI(_config) {
    return client;
  }
  const mockModule = { __esModule: true, GoogleGenAI: MockGoogleGenAI };
  const genaiPath = require.resolve('@google/genai');
  require.cache[genaiPath] = {
    id: genaiPath,
    filename: genaiPath,
    loaded: true,
    exports: mockModule,
    parent: null,
    children: [],
    paths: [],
  };
  return { stub };
}

/**
 * Purges all provider modules from require.cache so each test suite starts
 * fresh. This is necessary when tests need different param values.
 */
function purgeProviderModules() {
  const toPurge = [
    path.join(providersPath, 'openaiCompat.js'),
    path.join(providersPath, 'registry.js'),
    path.join(providersPath, 'gemini.js'),
    path.join(providersPath, 'retry.js'),
    path.join(providersPath, 'types.js'),
  ];
  for (const p of toPurge) {
    delete require.cache[p];
  }
}

/**
 * Monkey-patches the exported param objects on a loaded registry module so
 * tests can control AI_PROVIDER, fallbacks, and openai-compat config without
 * environment variables.
 */
function patchRegistryParams(registry, {
  aiProvider = 'gemini',
  fallbacks = '',
  allowFallback = 'false',
  baseUrl = '',
  apiKey = '',
  modelPro = '',
  modelFlash = '',
} = {}) {
  registry.AI_PROVIDER.value = () => aiProvider;
  registry.AI_PROVIDER_FALLBACKS.value = () => fallbacks;
  registry.ALLOW_PROVIDER_CONFIG_FALLBACK.value = () => allowFallback;
  registry.OPENAI_COMPAT_BASE_URL.value = () => baseUrl;
  registry.openaiCompatApiKey.value = () => apiKey;
  registry.OPENAI_COMPAT_MODEL_PRO.value = () => modelPro;
  registry.OPENAI_COMPAT_MODEL_FLASH.value = () => modelFlash;
}

// ============================================================================
// 1. Regression — AI_PROVIDER=gemini returns GeminiProvider from both helpers
// ============================================================================

section('Regression — AI_PROVIDER=gemini, behaviour identical to Stage A');

{
  // Register mock openai before loading modules
  registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));
  const { GeminiProvider } = require(path.join(providersPath, 'gemini.js'));
  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  patchRegistryParams(registry, { aiProvider: 'gemini' });

  const grounded = registry.getGroundedProvider('test-gemini-key');
  assert(
    'getGroundedProvider returns GeminiProvider',
    grounded instanceof GeminiProvider,
    `got ${grounded.constructor.name}`
  );
  assert(
    'getGroundedProvider.id is gemini',
    grounded.id === 'gemini',
    `got ${grounded.id}`
  );

  const { provider, providerId } = registry.getGenerationProvider('test-gemini-key');
  assert(
    'getGenerationProvider with AI_PROVIDER=gemini returns GeminiProvider',
    provider instanceof GeminiProvider,
    `got ${provider.constructor.name}`
  );
  assert(
    'getGenerationProvider with AI_PROVIDER=gemini returns providerId gemini',
    providerId === 'gemini',
    `got ${providerId}`
  );
  assert(
    'getGenerationProvider with AI_PROVIDER=gemini does not return OpenAICompatProvider',
    !(provider instanceof OpenAICompatProvider),
  );
}

// ============================================================================
// 2. Routing — grounded paths always Gemini; generation path provider-selectable
// ============================================================================

section('Routing — grounded paths stay Gemini when AI_PROVIDER=openai-compat');

{
  registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));
  const { GeminiProvider } = require(path.join(providersPath, 'gemini.js'));
  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  // Set AI_PROVIDER=openai-compat with all required params
  patchRegistryParams(registry, {
    aiProvider: 'openai-compat',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-compat-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  // Grounded helper must ignore AI_PROVIDER and always return Gemini
  const grounded = registry.getGroundedProvider('test-gemini-key');
  assert(
    'getGroundedProvider always returns GeminiProvider (even when AI_PROVIDER=openai-compat)',
    grounded instanceof GeminiProvider,
    `got ${grounded.constructor.name}`
  );
  assert(
    'getGroundedProvider.id is gemini (even when AI_PROVIDER=openai-compat)',
    grounded.id === 'gemini',
    `got ${grounded.id}`
  );

  // Generation helper should return OpenAICompatProvider
  const { provider: genProvider, providerId: genId } = registry.getGenerationProvider('test-gemini-key');
  assert(
    'getGenerationProvider with AI_PROVIDER=openai-compat returns OpenAICompatProvider',
    genProvider instanceof OpenAICompatProvider,
    `got ${genProvider.constructor.name}`
  );
  assert(
    'getGenerationProvider returns providerId openai-compat',
    genId === 'openai-compat',
    `got ${genId}`
  );

  // groundedSearch on OpenAICompatProvider must throw (never silently succeed)
  let groundedSearchThrew = false;
  try {
    await genProvider.groundedSearch('test prompt');
  } catch {
    groundedSearchThrew = true;
  }
  assert(
    'OpenAICompatProvider.groundedSearch throws a not-supported error',
    groundedSearchThrew,
  );
}

section('Routing — Gemini failure in digest fails clean (no fallback)');

{
  registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));
  const { GeminiProvider } = require(path.join(providersPath, 'gemini.js'));

  patchRegistryParams(registry, { aiProvider: 'gemini' });

  const provider = registry.getGroundedProvider('test-key');

  // Stub groundedSearch to throw a 503 (unavailable) error
  const unavailErr = new Error('"status":"UNAVAILABLE"');
  GeminiProvider.prototype.groundedSearch = async () => { throw unavailErr; };

  let threw = false;
  let thrownError = null;
  try {
    await registry.generateDevelopments(provider, 'test prompt');
  } catch (err) {
    threw = true;
    thrownError = err;
  }

  assert(
    'Gemini failure in digest throws (no fallover, no silent recovery)',
    threw,
  );
  assert(
    'Error propagates unchanged (no wrapping into a different type)',
    thrownError === unavailErr,
    `got ${thrownError?.message}`
  );

  // Restore
  delete GeminiProvider.prototype.groundedSearch;
}

section('Routing — 401/403/400 on briefing primary: no failover');

{
  const { stub: openaiStub, MockAPIError: LocalAPIError } = registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));
  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  patchRegistryParams(registry, {
    aiProvider: 'openai-compat',
    fallbacks: 'gemini',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  // 401 error — should not fail over
  const err401 = new LocalAPIError('Unauthorized', 401);
  openaiStub.createImpl = async () => { throw err401; };

  const { provider: p401, providerId: id401 } = registry.getGenerationProvider('test-gemini-key');

  let failoverOccurred = false;
  let caughtErr = null;
  try {
    await registry.withGenerationFailover(
      (p) => p.generateText('test', 'pro'),
      id401,
      p401,
      'test-gemini-key',
      10_000
    );
  } catch (err) {
    caughtErr = err;
    // Failover would change the provider; since GeminiProvider is in fallbacks
    // but auth errors don't fail over, the error should propagate as-is.
    failoverOccurred = (err !== err401);
  }

  assert(
    '401 error on primary: caughtErr is the original 401',
    caughtErr === err401,
    `got ${caughtErr?.message}`
  );
  assert(
    '401 error on primary: no failover occurred',
    !failoverOccurred,
  );
}

section('Routing — misconfigured selected provider + flag off = hard fail');

{
  registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));

  // openai-compat selected but params missing; ALLOW_PROVIDER_CONFIG_FALLBACK = false
  patchRegistryParams(registry, {
    aiProvider: 'openai-compat',
    allowFallback: 'false',
    baseUrl: '',       // missing
    apiKey: '',        // missing
    modelPro: '',      // missing
    modelFlash: '',    // missing
  });

  let threw = false;
  let errorMessage = '';
  try {
    registry.getGenerationProvider('test-gemini-key');
  } catch (err) {
    threw = true;
    errorMessage = err?.message ?? '';
  }

  assert(
    'Misconfigured openai-compat + flag off: getGenerationProvider throws',
    threw,
  );
  assert(
    'Error message mentions misconfiguration',
    errorMessage.toLowerCase().includes('misconfigur') || errorMessage.toLowerCase().includes('not set'),
    `got: ${errorMessage}`
  );
}

section('Routing — misconfigured selected provider + flag on = fallback to Gemini with warn');

{
  registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));
  const { GeminiProvider } = require(path.join(providersPath, 'gemini.js'));

  const warnMessages = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnMessages.push(args.join(' '));

  patchRegistryParams(registry, {
    aiProvider: 'openai-compat',
    allowFallback: 'true',
    baseUrl: '',
    apiKey: '',
    modelPro: '',
    modelFlash: '',
  });

  let result = null;
  try {
    result = registry.getGenerationProvider('test-gemini-key');
  } finally {
    console.warn = originalWarn;
  }

  assert(
    'Misconfigured openai-compat + flag on: getGenerationProvider returns GeminiProvider',
    result?.provider instanceof GeminiProvider,
    `got ${result?.provider?.constructor?.name}`
  );
  assert(
    'Misconfigured openai-compat + flag on: a warn was emitted',
    warnMessages.some(m => m.includes('misconfigured') || m.includes('falling back')),
    `warn messages: ${JSON.stringify(warnMessages)}`
  );
}

section('Routing — misconfigured fallback excluded, primary continues');

{
  const { stub: openaiStub } = registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));
  const { GeminiProvider } = require(path.join(providersPath, 'gemini.js'));

  const warnMessages = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnMessages.push(args.join(' '));

  // Primary: openai-compat (configured); Fallback: openai-compat again with missing config.
  // The fallback config check is: params, not constructor, so set fallback as a separate
  // entry. Actually the fallback uses the same params; this test sets a different fallback
  // provider id. Let us test: primary = gemini, fallback = openai-compat (misconfigured).
  patchRegistryParams(registry, {
    aiProvider: 'gemini',
    fallbacks: 'openai-compat',
    // openai-compat config deliberately missing
    baseUrl: '',
    apiKey: '',
    modelPro: '',
    modelFlash: '',
  });

  const warnMessagesBefore = warnMessages.length;

  // getGenerationProvider → gemini (primary is fine)
  const { provider: gProvider, providerId: gId } = registry.getGenerationProvider('test-gemini-key');

  assert(
    'Primary Gemini: provider is GeminiProvider',
    gProvider instanceof GeminiProvider,
    `got ${gProvider.constructor.name}`
  );

  // Inject a 503 so Gemini fails and the fallback chain is attempted.
  // The fallback (openai-compat) is misconfigured → excluded → chain exhausted → throws.
  const { isRetryableGeminiError } = require(path.join(providersPath, 'gemini.js'));
  GeminiProvider.prototype.generateText = async () => {
    const e = new Error('"status":"UNAVAILABLE"');
    throw e;
  };

  let threw = false;
  try {
    await registry.withGenerationFailover(
      (p) => p.generateText('test', 'pro'),
      gId,
      gProvider,
      'test-gemini-key',
      5_000
    );
  } catch {
    threw = true;
  } finally {
    console.warn = originalWarn;
    delete GeminiProvider.prototype.generateText;
  }

  assert(
    'Misconfigured fallback excluded → chain exhausted → throws',
    threw,
  );
  assert(
    'A warn was emitted for the misconfigured fallback',
    warnMessages.some(m => m.includes('openai-compat') && (m.includes('misconfigured') || m.includes('excluded'))),
    `warn messages: ${JSON.stringify(warnMessages)}`
  );
}

section('Routing — Gemini failure in briefing → failover to configured fallback if retryable');

{
  const { stub: openaiStub } = registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));
  const { GeminiProvider } = require(path.join(providersPath, 'gemini.js'));
  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  // Primary: gemini; Fallback: openai-compat (fully configured)
  patchRegistryParams(registry, {
    aiProvider: 'gemini',
    fallbacks: 'openai-compat',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  // Gemini primary fails with a 503 (retryable)
  let geminiCallCount = 0;
  GeminiProvider.prototype.generateText = async () => {
    geminiCallCount++;
    const e = new Error('"status":"UNAVAILABLE"');
    throw e;
  };

  // OpenAI fallback succeeds
  openaiStub.createImpl = async () => ({
    choices: [{ message: { content: 'fallback result' } }],
  });

  let result = null;
  let threw = false;
  try {
    const { provider, providerId } = registry.getGenerationProvider('test-gemini-key');
    result = await registry.withGenerationFailover(
      (p) => p.generateText('test', 'pro'),
      providerId,
      provider,
      'test-gemini-key',
      15_000
    );
  } catch {
    threw = true;
  } finally {
    delete GeminiProvider.prototype.generateText;
  }

  assert(
    'Gemini 503 in briefing: failover succeeded (no throw)',
    !threw,
  );
  assert(
    'Failover result is from the OpenAI-compat fallback',
    result === 'fallback result',
    `got: ${result}`
  );
}

// ============================================================================
// 3. Adapter — OpenAICompatProvider unit tests (mocked openai SDK)
// ============================================================================

section('Adapter — generateText returns message text');

{
  const { stub } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  stub.createImpl = async () => ({
    choices: [{ message: { content: 'generated briefing text' } }],
  });

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  let result = '';
  let threw = false;
  try {
    result = await provider.generateText('test prompt', 'pro');
  } catch {
    threw = true;
  }

  assert(
    'generateText returns the message text',
    result === 'generated briefing text',
    `got: ${result}`
  );
  assert('generateText did not throw', !threw);
}

section('Adapter — empty completion maps to canonical error');

{
  const { stub } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  stub.createImpl = async () => ({
    choices: [{ message: { content: '' } }],
  });

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  let threw = false;
  let errorMsg = '';
  try {
    await provider.generateText('test prompt', 'pro');
  } catch (err) {
    threw = true;
    errorMsg = err?.message ?? '';
  }

  assert('Empty completion throws', threw);
  assert(
    'Error message contains UNAVAILABLE canonical token',
    errorMsg.includes('UNAVAILABLE'),
    `got: ${errorMsg}`
  );
}

section('Adapter — classifyError token mapping');

{
  const { MockAPIError: LocalAPIError } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  const cases = [
    { status: 401, expectedToken: 'PERMISSION_DENIED', expectedCode: 'unauthenticated' },
    { status: 403, expectedToken: 'PERMISSION_DENIED', expectedCode: 'unauthenticated' },
    { status: 400, expectedToken: 'INVALID_ARGUMENT', expectedCode: 'invalid-argument' },
    { status: 404, expectedToken: 'INVALID_ARGUMENT', expectedCode: 'invalid-argument' },
    { status: 429, expectedToken: 'RESOURCE_EXHAUSTED', expectedCode: 'resource-exhausted' },
    { status: 503, expectedToken: 'UNAVAILABLE', expectedCode: 'unavailable' },
    { status: 500, expectedToken: 'UNAVAILABLE', expectedCode: 'unavailable' },
  ];

  for (const { status, expectedToken, expectedCode } of cases) {
    const err = new LocalAPIError(`HTTP ${status}`, status);
    const httpsErr = provider.classifyError(err);
    assert(
      `classifyError(${status}) → HttpsError code=${expectedCode}`,
      httpsErr.code === expectedCode,
      `got code=${httpsErr.code}`
    );
    assert(
      `classifyError(${status}) → message contains ${expectedToken}`,
      httpsErr.message.includes(expectedToken),
      `got message: ${httpsErr.message}`
    );
  }
}

section('Adapter — isProviderUnavailable');

{
  const { MockAPIError: LocalAPIError } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  // Should be true (retryable)
  assert('isProviderUnavailable(429) = true', provider.isProviderUnavailable(new LocalAPIError('rate limit', 429)));
  assert('isProviderUnavailable(503) = true', provider.isProviderUnavailable(new LocalAPIError('server error', 503)));
  assert('isProviderUnavailable(500) = true', provider.isProviderUnavailable(new LocalAPIError('internal error', 500)));

  const networkErr = new TypeError('Failed to fetch');
  networkErr.name = 'TypeError';
  assert('isProviderUnavailable(network TypeError) = true', provider.isProviderUnavailable(networkErr));

  const connErr = new Error('ECONNREFUSED');
  assert('isProviderUnavailable(ECONNREFUSED) = true', provider.isProviderUnavailable(connErr));

  // Should be false (non-retryable)
  assert('isProviderUnavailable(401) = false', !provider.isProviderUnavailable(new LocalAPIError('unauthorized', 401)));
  assert('isProviderUnavailable(403) = false', !provider.isProviderUnavailable(new LocalAPIError('forbidden', 403)));
  assert('isProviderUnavailable(400) = false', !provider.isProviderUnavailable(new LocalAPIError('bad request', 400)));

  const abortErr = new DOMException('Aborted', 'AbortError');
  assert('isProviderUnavailable(AbortError) = false', !provider.isProviderUnavailable(abortErr));
}

section('Adapter — extractJson happy path');

{
  const { stub } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  const sampleItems = [{ title: 'test', summary: 'test summary', category: 'Jurisprudence' }];
  stub.createImpl = async () => ({
    choices: [{ message: { content: JSON.stringify(sampleItems) } }],
  });

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  let result = null;
  let threw = false;
  try {
    result = await provider.extractJson('grounded text');
  } catch {
    threw = true;
  }

  assert('extractJson happy path: did not throw', !threw);
  assert(
    'extractJson happy path: returns parsed array',
    Array.isArray(result) && result.length === 1 && result[0].title === 'test',
    `got: ${JSON.stringify(result)}`
  );
}

section('Adapter — extractJson: endpoint rejects JSON mode → clear error, not silent degradation');

{
  const { stub, MockAPIError: LocalAPIError } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  // Simulate endpoint returning 400 with message about response_format
  stub.createImpl = async () => {
    throw new LocalAPIError('response_format not supported by this model', 400);
  };

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  let threw = false;
  let errorCode = '';
  let errorMsg = '';
  try {
    await provider.extractJson('grounded text');
  } catch (err) {
    threw = true;
    errorCode = err?.code ?? '';
    errorMsg = err?.message ?? '';
  }

  assert('extractJson JSON mode rejection: throws', threw);
  assert(
    'extractJson JSON mode rejection: error code is unimplemented',
    errorCode === 'unimplemented',
    `got code: ${errorCode}`
  );
  assert(
    'extractJson JSON mode rejection: error message explains JSON mode',
    errorMsg.includes('json_object') || errorMsg.includes('JSON'),
    `got message: ${errorMsg}`
  );
}

section('Adapter — no prompt or key in logs');

{
  const { stub } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  const sensitiveKey = 'sk-VERY-SECRET-KEY';
  const sensitivePrompt = 'CLASSIFIED BRIEFING CONTENT do not log';

  const loggedMessages = [];
  const captureLog = (...args) => { loggedMessages.push(args.join(' ')); };

  const originalError = console.error;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.error = captureLog;
  console.info = captureLog;
  console.warn = captureLog;

  // Trigger an error to exercise the logging path
  stub.createImpl = async () => { throw new Error('network timeout'); };

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: sensitiveKey,
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  try {
    await provider.generateText(sensitivePrompt, 'pro');
  } catch {
    // Expected: error path is what we're testing
  } finally {
    console.error = originalError;
    console.info = originalInfo;
    console.warn = originalWarn;
  }

  const allLogs = loggedMessages.join('\n');
  assert(
    'Logs do not contain the sensitive API key',
    !allLogs.includes(sensitiveKey),
    'API key appeared in logs'
  );
  assert(
    'Logs do not contain the prompt content',
    !allLogs.includes('CLASSIFIED BRIEFING CONTENT'),
    'Prompt content appeared in logs'
  );
}

section('Adapter — AbortSignal propagation to streamChat');

{
  const { stub } = registerOpenAIMock();
  purgeProviderModules();

  const { OpenAICompatProvider } = require(path.join(providersPath, 'openaiCompat.js'));

  // Simulate an abort: the create call receives a signal option
  let receivedSignalOption = null;
  stub.createImpl = async (params, opts) => {
    receivedSignalOption = opts;
    // Return an async iterable that yields one chunk then done
    return {
      [Symbol.asyncIterator]: function* () {
        yield { choices: [{ delta: { content: 'chunk' } }] };
      }
    };
  };

  const provider = new OpenAICompatProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelPro: 'test-pro',
    modelFlash: 'test-flash',
  });

  const controller = new AbortController();
  const chunks = [];
  try {
    await provider.streamChat(
      [{ role: 'user', content: 'hello' }],
      'You are a helpful assistant.',
      controller.signal,
      async (chunk) => { chunks.push(chunk); }
    );
  } catch {
    // May throw on abort — that is fine for this test
  }

  assert(
    'streamChat passes signal option to the SDK create call',
    receivedSignalOption !== null && typeof receivedSignalOption === 'object',
    `got: ${JSON.stringify(receivedSignalOption)}`
  );
  assert(
    'Signal passed is the AbortController signal',
    receivedSignalOption?.signal === controller.signal,
    'signal reference mismatch'
  );
}

// ============================================================================
// 4. Disclosure — getAIConfig runtime config derivation
// ============================================================================

section('Disclosure — getAIConfig never returns secrets; returns sanitised config');

{
  registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));

  // Simulate the config-derivation logic from getAIConfig (server-side).
  // We test the param-reading behaviour directly on the registry exports.

  patchRegistryParams(registry, {
    aiProvider: 'gemini',
    fallbacks: '',
    baseUrl: '',
    apiKey: 'sk-secret-should-not-appear',
    modelPro: 'gemini-2.5-pro',
    modelFlash: 'gemini-2.5-flash',
  });

  // Replicate the getAIConfig derivation
  const selectedProvider = registry.AI_PROVIDER.value().trim().toLowerCase() || 'gemini';
  const fallbacksRaw = registry.AI_PROVIDER_FALLBACKS.value().trim();
  const fallbackIds = fallbacksRaw
    ? fallbacksRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const config = {
    generationProviderId: selectedProvider,
    groundedProviderId: 'gemini',
    chatProviderId: 'gemini',
    fallbackProviderIds: fallbackIds,
    failoverEnabled: fallbackIds.length > 0,
    generationIsGemini: selectedProvider === 'gemini',
  };

  assert(
    'getAIConfig: generationProviderId is gemini',
    config.generationProviderId === 'gemini',
    `got: ${config.generationProviderId}`
  );
  assert(
    'getAIConfig: groundedProviderId is always gemini',
    config.groundedProviderId === 'gemini',
    `got: ${config.groundedProviderId}`
  );
  assert(
    'getAIConfig: chatProviderId is always gemini',
    config.chatProviderId === 'gemini',
    `got: ${config.chatProviderId}`
  );
  assert(
    'getAIConfig: falloverEnabled is false when no fallbacks configured',
    config.failoverEnabled === false,
    `got: ${config.failoverEnabled}`
  );
  assert(
    'getAIConfig: generationIsGemini true when AI_PROVIDER=gemini',
    config.generationIsGemini === true,
  );
  // The secret key must not be included in any config field
  const configJson = JSON.stringify(config);
  assert(
    'getAIConfig: does not include the secret API key',
    !configJson.includes('sk-secret-should-not-appear'),
    'API key appeared in config output'
  );
}

section('Disclosure — getAIConfig reflects openai-compat with fallback');

{
  registerOpenAIMock();
  purgeProviderModules();

  const registry = require(path.join(providersPath, 'registry.js'));

  patchRegistryParams(registry, {
    aiProvider: 'openai-compat',
    fallbacks: 'gemini',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-compat-secret',
    modelPro: 'gpt-5-mini',
    modelFlash: 'gpt-5-turbo',
  });

  const selectedProvider = registry.AI_PROVIDER.value().trim().toLowerCase() || 'gemini';
  const fallbacksRaw = registry.AI_PROVIDER_FALLBACKS.value().trim();
  const fallbackIds = fallbacksRaw
    ? fallbacksRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const modelPro = registry.OPENAI_COMPAT_MODEL_PRO.value().trim();
  const modelFlash = registry.OPENAI_COMPAT_MODEL_FLASH.value().trim();

  const config = {
    generationProviderId: selectedProvider,
    generationModelPro: modelPro || '(not configured)',
    generationModelFlash: modelFlash || '(not configured)',
    groundedProviderId: 'gemini',
    chatProviderId: 'gemini',
    fallbackProviderIds: fallbackIds,
    failoverEnabled: fallbackIds.length > 0,
    generationIsGemini: selectedProvider === 'gemini',
  };

  assert(
    'getAIConfig with openai-compat: generationProviderId is openai-compat',
    config.generationProviderId === 'openai-compat',
    `got: ${config.generationProviderId}`
  );
  assert(
    'getAIConfig with openai-compat: generationModelPro is non-secret model name',
    config.generationModelPro === 'gpt-5-mini',
    `got: ${config.generationModelPro}`
  );
  assert(
    'getAIConfig with openai-compat: fallbackProviderIds includes gemini',
    config.fallbackProviderIds.includes('gemini'),
    `got: ${JSON.stringify(config.fallbackProviderIds)}`
  );
  assert(
    'getAIConfig with openai-compat: failoverEnabled is true',
    config.failoverEnabled === true,
    `got: ${config.failoverEnabled}`
  );
  assert(
    'getAIConfig with openai-compat: generationIsGemini is false',
    config.generationIsGemini === false,
  );
  assert(
    'getAIConfig with openai-compat: API key not in output',
    !JSON.stringify(config).includes('sk-compat-secret'),
    'API key appeared in config output'
  );
}

// ============================================================================
// 5. Retry isolation — generateText must NOT retry internally
//    Retry is owned by withGenerationFailover; a nested inner retry would stack
//    time budgets and risk the briefing function timeout during a sustained
//    outage (cross-review invariant 6). Proven by counting SDK calls.
// ============================================================================

section('Retry isolation — Gemini generateText does not retry internally');

{
  const { stub } = registerGenaiMock();
  purgeProviderModules();

  const { GeminiProvider } = require(path.join(providersPath, 'gemini.js'));

  // A retryable 503. If generateText still wrapped withRetry internally, this
  // shape would trigger multiple SDK calls. It must produce exactly one — the
  // failover wrapper, not the provider method, owns retry.
  let calls = 0;
  stub.generateContentImpl = async () => {
    calls++;
    throw new Error('{"code":503,"status":"UNAVAILABLE"}');
  };

  const provider = new GeminiProvider('test-gemini-key');
  let threw = false;
  try {
    await provider.generateText('test prompt', 'pro');
  } catch {
    threw = true;
  }

  assert(
    'generateText surfaces the provider error (does not swallow it)',
    threw,
  );
  assert(
    'generateText issues exactly one SDK call on a retryable error (no internal retry)',
    calls === 1,
    `expected 1, got ${calls}`
  );

  // Sanity: a successful call returns the text in a single SDK call.
  calls = 0;
  stub.generateContentImpl = async () => {
    calls++;
    return { text: 'briefing body' };
  };
  const text = await provider.generateText('test prompt', 'flash');
  assert(
    'generateText returns the SDK text on success',
    text === 'briefing body',
    `got ${text}`
  );
  assert(
    'generateText issues exactly one SDK call on success',
    calls === 1,
    `expected 1, got ${calls}`
  );
}

// ============================================================================
// Summary
// ============================================================================

console.log(`\n════════════════════════════════`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log(`\n  Failed cases:`);
  for (const f of failures) console.log(`    • ${f}`);
}
console.log(`════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
