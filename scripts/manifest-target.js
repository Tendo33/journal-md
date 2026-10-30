// 按目标浏览器调整构建产物里的 manifest（移植自 arxiv-md scripts/manifest-target.js）。
// Chrome 对 MV3 的 background.scripts 报错，所以 Chrome/Edge 包去掉 scripts；Firefox 不支持 service_worker，保留 scripts。
// browser_specific_settings 只给 Firefox 包（Chrome 会提示未知字段），见 cross-browser-plan §2。
const TARGETS = ['chrome', 'firefox'];
// 以前（arxiv-md FF-01 方案 A）：Firefox 包把可选的 DNR 改成必需。Simon 2026-10-30 18:06 起两个浏览器都在安装时授予，
// 源 manifest 里已经没有 optional_permissions，下面这段只在旧写法下才起作用，保留以免回退
const FIREFOX_REQUIRED_DNR = 'declarativeNetRequestWithHostAccess';

// 只有「没给」（undefined/null）才默认 chrome；给了空值、非字符串或未知值都报错，不能悄悄构建成 Chrome 包
function normalizeTarget(target) {
  if (target === undefined || target === null) return 'chrome';
  if (typeof target !== 'string') throw new Error(`target must be target=chrome or target=firefox (got ${target})`);
  if (!target.trim()) throw new Error('target is empty; only chrome / firefox are supported');
  const t = target.trim().toLowerCase();
  if (!TARGETS.includes(t)) throw new Error(`unknown target=${target}; only chrome / firefox are supported`);
  return t;
}

// verify-dist 的参数：[distDir] [--target=chrome|firefox]。不给目录时校验 dist（chrome）和 dist-firefox（firefox）两份
function parseVerifyArgs(argv) {
  let target;
  const dirs = [];
  for (const a of argv) {
    if (a === '--target') throw new Error('write --target=chrome or --target=firefox (space form is not supported)');
    if (a.startsWith('--target=')) {
      if (target !== undefined) throw new Error('--target may only be given once');
      target = normalizeTarget(a.slice(9));
    } else if (a.startsWith('-')) {
      throw new Error(`unknown argument ${a}`);
    } else {
      dirs.push(a);
    }
  }
  if (dirs.length > 1) throw new Error(`only one dist directory may be given, got: ${dirs.join(' ')}`);
  if (!dirs.length && target === undefined) {
    return [{ target: 'chrome', dist: 'dist' }, { target: 'firefox', dist: 'dist-firefox' }];
  }
  const t = target || 'chrome';
  return [{ target: t, dist: dirs[0] || (t === 'firefox' ? 'dist-firefox' : 'dist') }];
}

function manifestForTarget(manifest, target) {
  const t = normalizeTarget(target);
  const out = JSON.parse(JSON.stringify(manifest));
  if (t === 'chrome') {
    if (out.background) delete out.background.scripts;
    delete out.browser_specific_settings;
  }
  if (t === 'firefox' && out.background) delete out.background.service_worker;
  if (t === 'firefox') {
    const opt = out.optional_permissions || [];
    if (opt.includes(FIREFOX_REQUIRED_DNR)) {
      out.optional_permissions = opt.filter((p) => p !== FIREFOX_REQUIRED_DNR);
      if (!out.optional_permissions.length) delete out.optional_permissions;
      out.permissions = [...(out.permissions || []), FIREFOX_REQUIRED_DNR];
    }
  }
  return out;
}

function verifyBackground(manifest, target) {
  const t = normalizeTarget(target);
  const errors = [];
  const scripts = manifest.background && manifest.background.scripts;
  if (t === 'firefox') {
    if (!Array.isArray(scripts) || !scripts.length) errors.push('Firefox build is missing background.scripts (Firefox has no service_worker)');
  } else {
    if (scripts !== undefined) errors.push('Chrome/Edge build must not have background.scripts (Chrome rejects it in MV3)');
    if (!(manifest.background && manifest.background.service_worker)) errors.push('Chrome/Edge build is missing background.service_worker');
  }
  return errors;
}

// webpack-cli 会把 `--env target=`（空值）整个丢掉；在 webpack.config 里直接看命令行，出现空的 target= 就报错
function assertEnvTargetNotEmpty(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = a.startsWith('--env=') ? a.slice(6) : (argv[i - 1] === '--env' ? a : null);
    if (v !== null && /^target=\s*$/.test(v)) throw new Error('--env target= is empty; only chrome / firefox are supported');
  }
}

module.exports = { TARGETS, FIREFOX_REQUIRED_DNR, normalizeTarget, parseVerifyArgs, assertEnvTargetNotEmpty, manifestForTarget, verifyBackground };
