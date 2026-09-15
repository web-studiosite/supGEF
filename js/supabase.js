/**
 * GEF - GESTÃO FINANCEIRA | CONEXÃO SUPABASE & REAL AUTH
 * 
 * Suporte a conexão nativa com Supabase:
 * - Login verdadeiro via supabase.auth.signInWithPassword()
 * - Registro via supabase.auth.signUp()
 * - Recuperação do perfil em public.profiles
 * - Persistência automática de sessão
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeRole } from './permissions.js';
import { db } from './database.js';

const CONFIG_STORAGE_KEY = 'gef_supabase_config_v1';

// Recupera configuração do localStorage ou variáveis de ambiente
function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.anonKey) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao ler supabase config do localStorage:', e);
  }

  const envUrl = window.__ENV__?.VITE_SUPABASE_URL || window.__ENV__?.SUPABASE_URL;
  const envKey = window.__ENV__?.VITE_SUPABASE_ANON_KEY || window.__ENV__?.SUPABASE_ANON_KEY;

  return {
    url: envUrl || 'https://seu-projeto.supabase.co',
    anonKey: envKey || 'sua-chave-anon-publica-do-supabase'
  };
}

let currentConfig = loadConfig();

export function isSupabaseConfigured() {
  return Boolean(
    currentConfig.url &&
    !currentConfig.url.includes('seu-projeto') &&
    currentConfig.anonKey &&
    !currentConfig.anonKey.includes('sua-chave')
  );
}

export function saveSupabaseConfig(url, anonKey) {
  const cleanUrl = (url || '').trim().replace(/\/$/, '');
  const cleanKey = (anonKey || '').trim();
  currentConfig = { url: cleanUrl, anonKey: cleanKey };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(currentConfig));
  initClient();
}

export function getSupabaseConfig() {
  return { ...currentConfig, isConfigured: isSupabaseConfigured() };
}

// Inicializa ou recria o cliente Supabase
export let supabase = null;

function initClient() {
  try {
    supabase = createClient(currentConfig.url, currentConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    console.warn('Falha ao inicializar cliente Supabase:', err);
    supabase = null;
  }
}

initClient();

/**
 * Autenticação real com Supabase
 */
export async function loginWithSupabase(email, password) {
  if (!supabase || !isSupabaseConfigured()) {
    return {
      success: false,
      isConfigError: true,
      error: 'Supabase ainda não configurado com URL e Anon Key válidas.'
    };
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim();

  if (!cleanEmail || !cleanPassword) {
    return {
      success: false,
      error: 'Por favor, informe o e-mail e a senha de acesso.'
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword
    });

    if (error) {
      let msg = error.message;
      if (msg.includes('Invalid login credentials')) {
        msg = 'Credenciais inválidas: e-mail ou senha incorretos no Supabase.';
      } else if (msg.includes('Email not confirmed')) {
        msg = 'E-mail ainda não confirmado no Supabase. Verifique sua caixa de entrada.';
      } else if (msg.includes('User not found')) {
        msg = 'Usuário não cadastrado no Supabase.';
      }
      return { success: false, error: msg };
    }

    if (!data?.user) {
      return { success: false, error: 'Credenciais inválidas: usuário não retornado pelo Supabase.' };
    }

    // Busca o perfil na tabela public.profiles por id E por email
    let profile = null;
    try {
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profData) {
        profile = profData;
      } else {
        const { data: profByEmail } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();
        if (profByEmail) profile = profByEmail;
      }
    } catch (e) {
      console.warn('Não foi possível buscar profile no Supabase:', e);
    }

    const userMeta = data.user.user_metadata || {};
    const appMeta = data.user.app_metadata || {};
    const rawRole = profile?.role || userMeta.role || appMeta.role;

    // Normalização estrita do papel (nunca improvisa papel incorreto)
    const role = normalizeRole(rawRole, data.user.id, data.user.email);

    // Determinação precisa da loja correspondente ao perfil
    let storeId;
    let storeName;
    if (role === 'SUPERADMIN') {
      storeId = 'ALL';
      storeName = 'Plataforma Global (Monitor & SaaS)';
    } else {
      storeId = profile?.store_id || userMeta.store_id || appMeta.store_id || 'store-001';
      try {
        const stores = db.getStores();
        const foundStore = stores.find(s => s.id === storeId);
        storeName = foundStore?.tradeName || foundStore?.name || (storeId === 'store-002' ? 'GEF Ferragens – Filial Matola Rio' : 'GEF Ferragens – Loja Matriz Maputo');
      } catch {
        storeName = storeId === 'store-002' ? 'GEF Ferragens – Filial Matola Rio' : 'GEF Ferragens – Loja Matriz Maputo';
      }
    }

    const fullName = profile?.full_name || userMeta.full_name || userMeta.name || appMeta.full_name || cleanEmail.split('@')[0].toUpperCase();

    const appUser = {
      id: data.user.id,
      email: data.user.email,
      fullName,
      role,
      storeId,
      storeName,
      supabaseAuth: true,
      active: true
    };

    // Auto-sincroniza a tabela profiles no Supabase para garantir persistência permanente do papel correto
    if (supabase && (!profile || profile.role !== role || profile.store_id !== storeId)) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email,
          full_name: fullName,
          role,
          store_id: storeId,
          active: true
        });
      } catch (syncErr) {
        console.warn('Aviso ao sincronizar profile no Supabase:', syncErr);
      }
    }

    return {
      success: true,
      user: appUser,
      session: data.session
    };
  } catch (err) {
    return { success: false, error: err.message || 'Falha na conexão com Supabase.' };
  }
}

/**
 * Registro de novo usuário com Supabase Auth
 */
export async function registerWithSupabase(email, password, fullName, role = 'CASHIER', storeId = 'store-001') {
  if (!supabase || !isSupabaseConfigured()) {
    return { success: false, error: 'Supabase não configurado.' };
  }

  const normalizedRole = normalizeRole(role, null, email);
  const targetStoreId = normalizedRole === 'SUPERADMIN' ? 'ALL' : storeId;

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName,
          role: normalizedRole,
          store_id: targetStoreId
        }
      }
    });

    if (error) return { success: false, error: error.message };

    // Registra na tabela profiles se possível
    if (data?.user) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email,
          full_name: fullName,
          role: normalizedRole,
          store_id: targetStoreId,
          active: true
        });
      } catch (e) {
        console.warn('Não foi possível gravar profile após signUp:', e);
      }
    }

    return { success: true, user: data.user, session: data.session };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Logout real no Supabase
 */
export async function logoutWithSupabase() {
  if (supabase && isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Erro ao fazer signOut no Supabase:', e);
    }
  }
}

// ==============================================================================
// CRUD SUPABASE COMPLETO & TRANSPARENTE
// ==============================================================================

export async function apiFetchStores() {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase.from('stores').select('*').order('name');
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar lojas:', err);
    return null;
  }
}

export async function apiUpsertStore(store) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('stores').upsert(store);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao gravar loja:', err);
    return false;
  }
}

export async function apiFetchProducts(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('products').select('*').order('name');
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar produtos:', err);
    return null;
  }
}

export async function apiUpsertProduct(product) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('products').upsert(product);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao gravar produto:', err);
    return false;
  }
}

export async function apiDeleteProduct(productId) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao excluir produto:', err);
    return false;
  }
}

export async function apiFetchCustomers(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('customers').select('*').order('name');
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar clientes:', err);
    return null;
  }
}

export async function apiUpsertCustomer(customer) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('customers').upsert(customer);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao gravar cliente:', err);
    return false;
  }
}

export async function apiDeleteCustomer(customerId) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('customers').delete().eq('id', customerId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao excluir cliente:', err);
    return false;
  }
}

export async function apiFetchSales(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('sales').select('*, items:sale_items(*)').order('created_at', { ascending: false });
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar vendas:', err);
    return null;
  }
}

export async function apiCreateSale(sale, items) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error: saleErr } = await supabase.from('sales').insert(sale);
    if (saleErr) throw saleErr;

    if (items && items.length > 0) {
      const itemsToInsert = items.map(it => ({
        sale_id: sale.id,
        product_id: it.productId,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        total_price: it.totalPrice,
        location: it.location || 'LOJA'
      }));
      const { error: itemsErr } = await supabase.from('sale_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;
    }
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao registrar venda atômica:', err);
    return false;
  }
}

export async function apiCancelSale(saleId) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('sales').update({ status: 'CANCELADA' }).eq('id', saleId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao cancelar venda:', err);
    return false;
  }
}

export async function apiFetchQuotes(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('quotes').select('*').order('created_at', { ascending: false });
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar orçamentos:', err);
    return null;
  }
}

export async function apiUpsertQuote(quote) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('quotes').upsert(quote);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao gravar orçamento:', err);
    return false;
  }
}

export async function apiFetchCashSessions(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('cash_sessions').select('*').order('opened_at', { ascending: false });
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar sessões de caixa:', err);
    return null;
  }
}

export async function apiUpsertCashSession(session) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('cash_sessions').upsert(session);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao gravar sessão de caixa:', err);
    return false;
  }
}

export async function apiFetchStockLosses(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('stock_losses').select('*').order('created_at', { ascending: false });
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar perdas:', err);
    return null;
  }
}

export async function apiInsertStockLoss(loss) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('stock_losses').insert(loss);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao registrar perda:', err);
    return false;
  }
}

export async function apiFetchStockTransfers(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('stock_transfers').select('*').order('created_at', { ascending: false });
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar transferências:', err);
    return null;
  }
}

export async function apiInsertStockTransfer(transfer) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('stock_transfers').insert(transfer);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao registrar transferência:', err);
    return false;
  }
}

export async function apiFetchDeliveries(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('deliveries').select('*').order('created_at', { ascending: false });
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar entregas:', err);
    return null;
  }
}

export async function apiUpsertDelivery(delivery) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('deliveries').upsert(delivery);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao gravar entrega:', err);
    return false;
  }
}

export async function apiFetchAmbassadors() {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase.from('ambassadors').select('*').order('name');
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar embaixadores:', err);
    return null;
  }
}

export async function apiUpsertAmbassador(ambassador) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('ambassadors').upsert(ambassador);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao gravar embaixador:', err);
    return false;
  }
}

export async function apiFetchAuditLogs(storeId) {
  if (!supabase || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase API] Falha ao listar logs de auditoria:', err);
    return null;
  }
}

export async function apiInsertAuditLog(log) {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('audit_logs').insert(log);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[Supabase API] Falha ao registrar log de auditoria:', err);
    return false;
  }
}

export default supabase;
