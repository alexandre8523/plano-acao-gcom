// Conexão com o Supabase: login, carga dos dados do mês e gravação do acompanhamento.
// Expõe para o painel o mesmo formato simples usado na versão original (doc/collection/onSnapshot).
(function () {
  const C = window.PAINEL_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const configurado = C.SUPABASE_URL && !/SEU-PROJETO/.test(C.SUPABASE_URL) && C.SUPABASE_ANON_KEY && !/COLE-AQUI/.test(C.SUPABASE_ANON_KEY);

  function erro(e) {
    const msg = (e && e.message) || 'erro';
    const st = e && (e.status || e.statusCode);
    let code = 'unavailable';
    if ((e && e.code === '42501') || st === 401 || st === 403 || /row-level security|permission denied|JWT/i.test(msg)) code = 'not_granted';
    else if ((e && /^PGRST20[0-9]$/.test(String(e.code || ''))) || /schema cache|column .* does not exist|could not find the .* column/i.test(msg)) code = 'schema';
    else if (st === 429) code = 'resource_exhausted';
    else if (e && /^(22|23)/.test(String(e.code || ''))) code = 'invalid_argument';
    const x = new Error(msg); x.code = code; return x;
  }

  function criarDb(sb, sess, periodo) {
    const recarregar = {};
    const linha = (tab, id, o) => tab === 'acoes'
      ? { id: periodo + '-' + id, periodo, acao: o.acao, status: o.status, progresso: o.progresso, responsavel: o.responsavel, prazo: o.prazo || null, obs: o.obs || '', atualizado_em: o.at, autor_id: sess.id, autor_nome: sess.nome }
      : { id: periodo + '-' + id, periodo, acao: o.acao, status: o.status, progresso: o.progresso, nota: o.nota || '', obs: o.obs || '', mudancas: o.mudancas || '', tags: o.tags || [], registrado_em: o.at, autor_id: sess.id, autor_nome: sess.nome };
    const idLocal = (r) => r.id.startsWith(periodo + '-') ? r.id.slice(periodo.length + 1) : r.id;
    const dados = (tab, r) => tab === 'acoes'
      ? { acao: r.acao, status: r.status, progresso: r.progresso, responsavel: r.responsavel, prazo: r.prazo, obs: r.obs || '', at: r.atualizado_em, by: r.autor_id, byNome: r.autor_nome }
      : { acao: r.acao, status: r.status, progresso: r.progresso, nota: r.nota, obs: r.obs || '', mudancas: r.mudancas, tags: r.tags || [], at: r.registrado_em, by: r.autor_id, byNome: r.autor_nome, editadoEm: r.editado_em, editadoPor: r.editado_por, editadoPorNome: r.editado_por_nome };
    const exec = async (tab, q) => {
      let res;
      try { res = await q; } catch (e) { throw erro(e); }
      if (res.error) throw erro(res.error);
      if (recarregar[tab]) recarregar[tab]();
    };
    return {
      doc(caminho) {
        const [tab, id] = caminho.split('/');
        const chave = periodo + '-' + id;
        return {
          set: (o) => exec(tab, sb.from(tab).upsert(linha(tab, id, o))),
          update: (o) => {
            const u = {};
            if ('nota' in o) u.nota = o.nota;
            if ('tags' in o) u.tags = o.tags;
            if ('obs' in o) u.obs = o.obs;
            if ('status' in o) u.status = o.status;
            if ('progresso' in o) u.progresso = o.progresso;
            if ('editadoEm' in o) { u.editado_em = o.editadoEm; u.editado_por = sess.id; u.editado_por_nome = sess.nome; }
            return exec(tab, sb.from(tab).update(u).eq('id', chave));
          },
          delete: () => exec(tab, sb.from(tab).delete().eq('id', chave)),
        };
      },
      collection(tab) {
        const q = {
          orderBy() { return q; },
          limit() { return q; },
          onSnapshot(next, falha) {
            let linhas = new Map(); let ativo = true; let pend = null;
            const emitir = () => next({ size: linhas.size, docs: [...linhas.values()].map((r) => ({ id: idLocal(r), data: () => dados(tab, r) })) });
            const carregar = async () => {
              const { data, error } = await sb.from(tab).select('*').eq('periodo', periodo).limit(5000);
              if (!ativo) return;
              if (error) { if (falha) falha(erro(error)); return; }
              linhas = new Map(data.map((r) => [r.id, r])); emitir();
            };
            recarregar[tab] = () => { clearTimeout(pend); pend = setTimeout(carregar, 150); };
            const canal = sb.channel('rt-' + tab + '-' + periodo)
              .on('postgres_changes', { event: '*', schema: 'public', table: tab }, (p) => {
                if (p.eventType === 'DELETE') { if (p.old && p.old.id) linhas.delete(p.old.id); emitir(); return; }
                if (p.new && p.new.periodo === periodo) { linhas.set(p.new.id, p.new); emitir(); }
              })
              .subscribe((st) => { if (st === 'SUBSCRIBED') carregar(); });
            carregar();
            const t = setInterval(carregar, 60000);
            return () => { ativo = false; clearInterval(t); sb.removeChannel(canal); };
          },
        };
        return q;
      },
    };
  }

  function explicarErro(m, acao) {
    m = String(m || '');
    if (/failed to fetch|network|load failed/i.test(m)) return 'Não foi possível falar com o Supabase em ' + String(C.SUPABASE_URL).trim() + '. Confira o SUPABASE_URL no config.js, se o projeto está ativo (não pausado) e se a rede da empresa libera *.supabase.co.';
    if (/invalid api key|apikey|jwt/i.test(m)) return 'A chave SUPABASE_ANON_KEY no config.js está incorreta. Copie a chave "anon public" em Project Settings > API.';
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'Este usuário ainda não foi confirmado. No Supabase, em Authentication > Users, crie o usuário marcando "Auto Confirm User".';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    if (/redirect/i.test(m)) return 'Endereço do site não autorizado. Inclua ' + location.origin + ' em Authentication > URL Configuration no Supabase.';
    if (/should be at least|password.*(short|characters)|weak/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres (ou o mínimo definido no Supabase).';
    if (/same.*password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual.';
    return 'Não foi possível ' + acao + ': ' + m;
  }

  function telaLogin(sb, aviso) {
    $('login').hidden = false; $('app').hidden = true;
    if ($('l-dominio')) $('l-dominio').textContent = '@' + C.DOMINIO_PERMITIDO;
    $('l-ms').hidden = !C.LOGIN_MICROSOFT;
    $('l-link').hidden = C.LOGIN_LINK_EMAIL === false;
    const msg = $('l-msg');
    const ok = (t) => { msg.className = 'msg okm'; msg.textContent = t; };
    const ruim = (t) => { msg.className = 'msg err'; msg.textContent = t; };
    if (aviso) ruim(aviso);
    const emailValido = () => {
      const email = $('l-email').value.trim().toLowerCase();
      if (!email || !email.endsWith('@' + C.DOMINIO_PERMITIDO)) { ruim('Use seu e-mail @' + C.DOMINIO_PERMITIDO + '.'); return null; }
      return email;
    };
    $('l-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const email = emailValido(); if (!email) return;
      const senha = $('l-senha').value;
      if (!senha) { ruim('Digite sua senha.'); $('l-senha').focus(); return; }
      $('l-enviar').disabled = true; msg.className = 'msg'; msg.textContent = 'Entrando…';
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      $('l-enviar').disabled = false;
      if (error) { ruim(explicarErro(error.message, 'entrar')); return; }
      msg.textContent = '';
    };
    $('l-link').onclick = async () => {
      const email = emailValido(); if (!email) return;
      $('l-link').disabled = true; msg.className = 'msg'; msg.textContent = 'Enviando…';
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      $('l-link').disabled = false;
      if (error) { ruim(/signups not allowed|user not found/i.test(error.message) ? 'Este e-mail ainda não tem acesso. Peça ao administrador para criar seu usuário.' : explicarErro(error.message, 'enviar o link')); return; }
      ok('Pronto! Abra seu e-mail e clique no link de acesso enviado para ' + email + '.');
    };
    $('l-ms').onclick = () => sb.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email', redirectTo: location.origin + location.pathname } });
  }

  function trocaSenha(sb) {
    const box = $('pw-box'), msg = $('pw-msg');
    $('u-senha').onclick = () => { box.hidden = !box.hidden; msg.textContent = ''; if (!box.hidden) $('pw-nova').focus(); };
    $('pw-cancelar').onclick = () => { box.hidden = true; $('pw-nova').value = ''; $('pw-conf').value = ''; };
    $('pw-salvar').onclick = async () => {
      const a = $('pw-nova').value, b = $('pw-conf').value;
      if (a.length < 6) { msg.className = 'msg err'; msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
      if (a !== b) { msg.className = 'msg err'; msg.textContent = 'As duas senhas não são iguais.'; return; }
      $('pw-salvar').disabled = true; msg.className = 'msg'; msg.textContent = 'Salvando…';
      const { error } = await sb.auth.updateUser({ password: a });
      $('pw-salvar').disabled = false;
      if (error) { msg.className = 'msg err'; msg.textContent = explicarErro(error.message, 'alterar a senha'); return; }
      $('pw-nova').value = ''; $('pw-conf').value = '';
      msg.className = 'msg okm'; msg.textContent = 'Senha alterada. Use a nova senha no próximo acesso.';
    };
  }

  async function iniciar() {
    if (!configurado) { $('login').hidden = false; $('l-form').hidden = true; $('l-msg').className = 'msg err'; $('l-msg').textContent = 'Painel ainda não configurado: preencha SUPABASE_URL e SUPABASE_ANON_KEY no arquivo config.js.'; return; }
    const url = String(C.SUPABASE_URL).trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
    const falhaCfg = (t) => { $('login').hidden = false; $('l-form').hidden = true; $('l-msg').className = 'msg err'; $('l-msg').textContent = t; };
    if (/supabase\.com\/dashboard/i.test(url)) { falhaCfg('O SUPABASE_URL no config.js é o endereço do painel do Supabase. Use a "Project URL" (Project Settings > API), no formato https://xxxx.supabase.co'); return; }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) { falhaCfg('O SUPABASE_URL no config.js está em formato inválido (' + url + '). O correto é https://xxxx.supabase.co, sem nada depois.'); return; }
    if (!window.supabase || !window.supabase.createClient) { falhaCfg('Não foi possível carregar a biblioteca do Supabase (cdn.jsdelivr.net). Verifique se a rede/antivírus da empresa bloqueia esse endereço.'); return; }
    const sb = window.supabase.createClient(url, String(C.SUPABASE_ANON_KEY).trim(), { auth: { persistSession: true, detectSessionInUrl: true } });
    let iniciado = false;
    const entrar = async (session) => {
      if (!session) { telaLogin(sb); return; }
      const u = session.user; const email = (u.email || '').toLowerCase();
      if (!email.endsWith('@' + C.DOMINIO_PERMITIDO)) { await sb.auth.signOut(); telaLogin(sb, 'Acesso liberado só para e-mails @' + C.DOMINIO_PERMITIDO + '.'); return; }
      if (iniciado) return; iniciado = true;
      const nome = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || email.split('@')[0];
      $('login').hidden = true;
      const padrao = window.PAINEL_PADRAO || {};
      let cfg = JSON.parse(JSON.stringify(padrao)), admin = false;
      try {
        const [rc, ra] = await Promise.all([
          sb.from('configuracoes').select('conteudo').eq('id', 'geral').maybeSingle(),
          sb.rpc('is_admin'),
        ]);
        if (!rc.error && rc.data && rc.data.conteudo) cfg = Object.assign({}, cfg, rc.data.conteudo);
        admin = !ra.error && ra.data === true;
      } catch (e) { /* área de administração ainda não instalada: segue com o padrão */ }
      const { data, error } = await sb.from('painel_dados').select('conteudo, atualizado_em').eq('id', 'atual').maybeSingle();
      if (error || (!data && !admin)) {
        $('login').hidden = false; $('l-form').hidden = true;
        $('l-msg').className = 'msg err';
        $('l-msg').textContent = error ? 'Não foi possível carregar os dados: ' + error.message : 'Ainda não há dados carregados. Peça a um administrador para importar a planilha do mês.';
        iniciado = false; return;
      }
      const D = data ? data.conteudo : null;
      const periodo = D ? (D.chave || String(D.inicio || '').slice(0, 7) || 'atual') : 'atual';
      const sess = { id: u.id, nome, email, podeEditar: true, admin, cfg };
      sess.salvarPlano = async (novoD) => {
        const agora = new Date().toISOString();
        const r1 = await sb.from('painel_dados').upsert({ id: periodo, conteudo: novoD, atualizado_em: agora });
        if (r1.error) throw erro(r1.error);
        const r2 = await sb.from('painel_dados').upsert({ id: 'atual', conteudo: novoD, atualizado_em: agora });
        if (r2.error) throw erro(r2.error);
      };
      $('app').hidden = false;
      $('u-email').textContent = email;
      $('u-sair').onclick = async () => { await sb.auth.signOut(); location.reload(); };
      trocaSenha(sb);
      let adminPronto = false;
      // Duas telas: "Painel" (indicadores, gráficos e ações) e "Ajustes" (área de administração)
      const irPara = (tela) => {
        const app = document.getElementById('app'), box = $('admin');
        const ajustes = tela === 'ajustes' && admin;
        if (ajustes && !adminPronto && window.iniciarAdmin) { window.iniciarAdmin(ctxAdmin); adminPronto = true; }
        box.hidden = !ajustes;
        app.classList.toggle('modo-ajustes', ajustes);
        $('u-painel').classList.toggle('ativo', !ajustes); $('u-painel').setAttribute('aria-pressed', String(!ajustes));
        $('u-admin').classList.toggle('ativo', ajustes); $('u-admin').setAttribute('aria-pressed', String(ajustes));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      const ctxAdmin = { sb, sess, D, cfg, padrao, recarregar: () => location.reload(), voltarPainel: () => irPara('painel') };
      $('u-admin').hidden = !admin;
      $('u-painel').hidden = !admin;
      $('u-admin').onclick = () => irPara('ajustes');
      $('u-painel').onclick = () => { if (D) irPara('painel'); };
      $('u-painel').disabled = !D;
      irPara('painel');
      if (!D) {
        document.getElementById('app').classList.add('sem-dados');
        $('h-title').textContent = cfg.titulo || 'Plano de Ação';
        irPara('ajustes');
        return;
      }
      window.iniciarPainel(D, criarDb(sb, sess, periodo), sess);
    };
    sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') entrar(session); if (ev === 'SIGNED_OUT') { iniciado = false; telaLogin(sb); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
