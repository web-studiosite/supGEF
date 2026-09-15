/**
 * GEF - GESTÃO FINANCEIRA | AUTH SERVICE (SUPABASE ONLY)
 * Autenticação Única e Estrita via Supabase
 */

import { SUPERADMIN_SPECIAL_ID, normalizeRole, canSwitchStores } from './permissions.js';
import { db } from './database.js';
import { loginWithSupabase, logoutWithSupabase, isSupabaseConfigured, supabase } from './supabase.js';

const AUTH_STORAGE_KEY = 'gef_authenticated_user_v2';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.listeners = new Set();
    this.init();
  }

  init() {
    // Restaura sessão existente (cache seguro temporário até validação do Supabase)
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) {
          const role = normalizeRole(parsed.role, parsed.id, parsed.email);
          this.currentUser = {
            ...parsed,
            role,
            storeId: role === 'SUPERADMIN' ? 'ALL' : (parsed.storeId || 'store-001')
          };
        }
      }
    } catch {
      this.currentUser = null;
    }

    // Se o cliente Supabase estiver ativo, escuta mudanças de sessão em tempo real
    if (supabase && typeof supabase.auth?.onAuthStateChange === 'function') {
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          if (event === 'SIGNED_OUT') {
            this.currentUser = null;
            localStorage.removeItem(AUTH_STORAGE_KEY);
            this.notify();
          }
        } else if (event === 'SIGNED_IN' && session.user) {
          // Atualiza perfil caso tenha mudado
          if (!this.currentUser || this.currentUser.id !== session.user.id) {
            await this.loadProfileForUser(session.user);
          }
        }
      });
    }
  }

  async loadProfileForUser(supabaseUser) {
    if (!supabaseUser) return null;
    let role = 'CASHIER';
    let storeId = 'store-001';
    let fullName = supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Usuário';

    if (supabase) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', supabaseUser.id)
          .maybeSingle();

        if (profile) {
          role = profile.role || role;
          storeId = profile.store_id || storeId;
          fullName = profile.full_name || fullName;
        }
      } catch (err) {
        console.warn('Erro ao carregar perfil do Supabase:', err);
      }
    }

    const normalizedRole = normalizeRole(role, supabaseUser.id, supabaseUser.email);
    const targetStoreId = normalizedRole === 'SUPERADMIN' ? 'ALL' : storeId;

    this.currentUser = {
      id: supabaseUser.id,
      email: supabaseUser.email,
      fullName,
      role: normalizedRole,
      storeId: targetStoreId,
      storeName: targetStoreId === 'ALL' ? 'Plataforma Global (Monitor & SaaS)' : 'Loja Matriz',
      active: true
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
    this.notify();
    return this.currentUser;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.currentUser);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.currentUser));
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return !!this.currentUser && this.currentUser.active !== false;
  }

  /**
   * ÚNICO CAMINHO DE LOGIN: Autenticação direta e estrita com Supabase
   * Sem inventar login falso, sem fallback de demonstração.
   */
  async signIn(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return { 
        success: false, 
        error: 'Por favor, informe o e-mail e a senha de acesso.' 
      };
    }

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error: 'Supabase não configurado. Por favor, conecte a URL e a Chave Anon do seu projeto Supabase.'
      };
    }

    try {
      const supaRes = await loginWithSupabase(cleanEmail, cleanPassword);

      // Se falhar ou dados ausentes, IMPEDE O LOGIN e retorna notificação exata de erro!
      if (!supaRes.success || !supaRes.user) {
        return {
          success: false,
          error: supaRes.error || 'Credenciais inválidas: e-mail ou senha incorretos.'
        };
      }

      this.currentUser = supaRes.user;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));

      if (this.currentUser.role === 'SUPERADMIN') {
        db.setCurrentStoreId('ALL');
      } else if (this.currentUser.storeId && this.currentUser.storeId !== 'ALL') {
        db.setCurrentStoreId(this.currentUser.storeId);
      }

      this.notify();
      return { success: true, user: this.currentUser };
    } catch (err) {
      console.error('Falha crítica na autenticação Supabase:', err);
      return {
        success: false,
        error: 'Falha de comunicação com o Supabase: ' + (err.message || 'Verifique sua conexão.')
      };
    }
  }

  switchActiveStore(storeId) {
    if (!this.currentUser) return;
    if (!canSwitchStores(this.currentUser)) {
      console.warn('Troca de loja não autorizada para este perfil de usuário.');
      return;
    }
    const stores = db.getStores();
    const assignedStore = stores.find(s => s.id === storeId);
    const storeName = storeId === 'ALL'
      ? 'Todas as Filiais (Consolidado)'
      : (assignedStore?.tradeName || assignedStore?.name || 'Loja Ativa');

    this.currentUser = {
      ...this.currentUser,
      storeId,
      storeName
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
    this.notify();
  }

  signOut() {
    this.currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    logoutWithSupabase();
    this.notify();
  }
}

export const auth = new AuthService();
