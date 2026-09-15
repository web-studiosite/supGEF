/**
 * GEF - GESTÃO FINANCEIRA | LOGIN MODULE
 * Caminho Único e Autêntico de Login via Supabase
 */

import { auth } from './auth.js';
import { showToast } from './toast.js';
import { isSupabaseConfigured, getSupabaseConfig, saveSupabaseConfig } from './supabase.js';

export function initLoginModule(container, onSuccess) {
  const supaCfg = getSupabaseConfig();
  const isConnected = isSupabaseConfigured();

  container.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: #0b0f19;">
      <div style="width: 100%; max-width: 440px; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
        <!-- Logo & Header -->
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; margin-bottom: 12px;">
            <img src="assets/icons/icon.svg" alt="GEF Logo" style="width: 44px; height: 44px;" onerror="this.src='../assets/icons/icon.svg'">
          </div>
          <h1 style="font-size: 20px; font-weight: 900; color: #f8fafc; margin: 0;">GEF - GESTÃO FINANCEIRA</h1>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 4px;">ERP Especializado para Materiais de Construção & Ferragens</p>
        </div>

        <!-- Supabase Status Badge / Config Toggle -->
        <div style="margin-bottom: 18px;">
          <button 
            type="button" 
            id="btn-toggle-supa-cfg" 
            style="width: 100%; background: ${isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border: 1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 8px 12px; font-size: 11px; color: ${isConnected ? '#34d399' : '#f87171'}; display: flex; align-items: center; justify-content: space-between; cursor: pointer;"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${isConnected ? '#10b981' : '#ef4444'}; display: inline-block;"></span>
              <strong>${isConnected ? 'Supabase Auth & Database Conectado' : 'Supabase (Clique para Configurar Chaves)'}</strong>
            </div>
            <span style="font-size: 10px; color: #94a3b8; text-decoration: underline;">${isConnected ? 'Alterar Chaves' : 'Configurar'}</span>
          </button>

          <!-- Collapsible Supabase Key Config Form -->
          <div id="supa-config-box" style="display: ${isConnected ? 'none' : 'block'}; margin-top: 10px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; font-size: 11px;">
            <div style="font-weight: 700; color: #f8fafc; margin-bottom: 8px;">Conexão com Supabase (Project Settings &rarr; API)</div>
            <p style="color: #94a3b8; font-size: 10px; margin-bottom: 8px;">Todas as autenticações e dados são verificados no Supabase:</p>
            <div style="margin-bottom: 8px;">
              <label style="color: #94a3b8; display: block; margin-bottom: 2px;">Project URL:</label>
              <input type="text" id="cfg-supa-url" value="${supaCfg.url || ''}" placeholder="https://xyzcompany.supabase.co" style="width: 100%; font-size: 11px; font-family: var(--font-mono); padding: 6px 8px; background: #1e293b; border: 1px solid #475569; border-radius: 6px; color: #fff;">
            </div>
            <div style="margin-bottom: 10px;">
              <label style="color: #94a3b8; display: block; margin-bottom: 2px;">Anon / Public Key:</label>
              <input type="password" id="cfg-supa-key" value="${supaCfg.anonKey || ''}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." style="width: 100%; font-size: 11px; font-family: var(--font-mono); padding: 6px 8px; background: #1e293b; border: 1px solid #475569; border-radius: 6px; color: #fff;">
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="btn-cancel-supa-cfg" style="padding: 5px 10px; font-size: 10px;">Fechar</button>
              <button type="button" class="btn btn-primary" id="btn-save-supa-cfg" style="padding: 5px 12px; font-size: 10px;">Salvar Conexão</button>
            </div>
          </div>
        </div>

        <!-- Single Real Login Form -->
        <form id="form-login" style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">E-mail do Usuário</label>
            <input type="email" id="login-email" placeholder="seu.email@gef.co.mz" required style="width: 100%; font-size: 13px; padding: 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #fff;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">Senha de Acesso</label>
            <input type="password" id="login-password" placeholder="••••••••" required style="width: 100%; font-size: 13px; padding: 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #fff;">
          </div>

          <button type="submit" class="btn btn-primary" id="btn-submit-login" style="width: 100%; padding: 12px; font-size: 13px; font-weight: 800; margin-top: 6px;">
            Acessar Sistema GEF
          </button>
        </form>

        <div style="margin-top: 20px; padding: 12px; background: #0f172a; border-radius: 8px; border: 1px solid #1e293b; font-size: 10px; color: #64748b; line-height: 1.5;">
          <div style="color: #94a3b8; font-weight: 700; margin-bottom: 4px;">Autenticação Oficial Supabase:</div>
          <div>• Super Administrador: acessa todas as filiais e monitor SaaS global.</div>
          <div>• Administrador / Gerente: gerencia a filial vinculada.</div>
          <div>• Operador de Caixa: exclusivo para PDV e abertura/fechamento de caixa.</div>
        </div>
      </div>
    </div>
  `;

  // Toggle config box
  const toggleBtn = container.querySelector('#btn-toggle-supa-cfg');
  const configBox = container.querySelector('#supa-config-box');
  if (toggleBtn && configBox) {
    toggleBtn.onclick = () => {
      configBox.style.display = configBox.style.display === 'none' ? 'block' : 'none';
    };
  }

  const cancelCfgBtn = container.querySelector('#btn-cancel-supa-cfg');
  if (cancelCfgBtn && configBox) {
    cancelCfgBtn.onclick = () => { configBox.style.display = 'none'; };
  }

  const saveCfgBtn = container.querySelector('#btn-save-supa-cfg');
  if (saveCfgBtn) {
    saveCfgBtn.onclick = () => {
      const url = container.querySelector('#cfg-supa-url').value.trim();
      const key = container.querySelector('#cfg-supa-key').value.trim();
      if (!url || !key) {
        showToast('Informe a URL e a Anon Key do Supabase.', 'error');
        return;
      }
      saveSupabaseConfig(url, key);
      showToast('Credenciais do Supabase salvas com sucesso!', 'success');
      initLoginModule(container, onSuccess);
    };
  }

  // Submit standard single form
  const form = container.querySelector('#form-login');
  const submitBtn = container.querySelector('#btn-submit-login');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = container.querySelector('#login-email').value;
    const password = container.querySelector('#login-password').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando no Supabase...';

    try {
      const res = await auth.signIn(email, password);
      if (res.success && res.user) {
        showToast(`Bem-vindo, ${res.user.fullName}!`, 'success');
        if (onSuccess) onSuccess(res.user);
      } else {
        // Notificação direta e clara de erro. Sem improvisar nada!
        showToast(res.error || 'Credenciais inválidas: e-mail ou senha incorretos.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Erro inesperado ao realizar login.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Acessar Sistema GEF';
    }
  };
}
