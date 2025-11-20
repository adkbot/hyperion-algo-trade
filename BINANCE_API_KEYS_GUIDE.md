# 🔑 Guia de Configuração de API Keys da Binance

## ⚠️ IMPORTANTE: Por que reconfigurar?

Se você está recebendo erros `401 - Invalid API-key, IP, or permissions for action`, suas chaves da Binance estão **incorretamente configuradas**. Este guia explica como criar novas chaves com as permissões corretas.

---

## 📋 Passo a Passo Completo

### **1. Acessar o Portal de API da Binance**
1. Acesse [Binance.com](https://www.binance.com) e faça login
2. Clique no seu **perfil** (canto superior direito)
3. Selecione **API Management** (Gerenciamento de API)

### **2. Criar Nova API Key**
1. Clique em **Create API** (Criar API)
2. Escolha:
   - **System generated** (Gerado pelo sistema) - RECOMENDADO
   - Ou **Self generated** se preferir mais controle
3. Dê um nome descritivo (ex: "Trading Bot Prod")
4. Complete a verificação de segurança (2FA, email, etc.)

### **3. Configurar Permissões (CRÍTICO!)**

Na página de edição da API Key, **ATIVE** as seguintes permissões:

```
✅ Enable Reading (Leitura)
✅ Enable Futures (Futuros) 
✅ Enable Trading (Negociação)
❌ Enable Withdrawals (DESABILITADO - não é necessário)
```

**⚠️ ATENÇÃO:** Se você não ativar `Enable Futures` e `Enable Trading`, o bot **NÃO CONSEGUIRÁ** abrir operações!

### **4. Configurar IP Whitelist (IMPORTANTE!)**

**OPÇÃO A: Sem Restrição de IP (RECOMENDADO para Cloud/Supabase)**
```
⚪ Unrestricted (access from any location)
```

**OPÇÃO B: IP Restrito (Apenas se souber o IP fixo do Supabase)**
```
🔒 Restrict access to trusted IPs only
```
⚠️ **CUIDADO:** Se escolher IP restrito e não souber o IP do Supabase Edge Functions, a API não funcionará!

Para uso com **Supabase Edge Functions**, é **ALTAMENTE RECOMENDADO** usar "Unrestricted", pois os IPs dos Edge Functions podem mudar.

### **5. Copiar as Chaves**

Após criar, você verá:
```
API Key: xxxxxxxxxxxxxxxxxxxxxxxxxxx
Secret Key: yyyyyyyyyyyyyyyyyyyyyyyyyyy
```

⚠️ **CRÍTICO:** 
- A **Secret Key** só aparece **UMA VEZ**!
- Copie e guarde em local seguro
- Se perder, terá que criar uma nova API Key

### **6. Adicionar ao Sistema**

1. Acesse as **Configurações** do sistema (botão ⚙️)
2. Vá até a seção **Credenciais da Binance**
3. Cole:
   - **API Key** no campo correspondente
   - **API Secret** no campo correspondente
4. Clique em **Salvar Configurações**
5. Teste a conexão (botão "Testar Conexão")

---

## ✅ Checklist Final

Antes de ativar o bot, confirme:

- [ ] API Key criada com permissões `Reading`, `Futures` e `Trading`
- [ ] IP Whitelist configurado como "Unrestricted"
- [ ] API Key e Secret copiadas e salvas em local seguro
- [ ] Credenciais adicionadas ao sistema
- [ ] Teste de conexão executado com **SUCESSO**
- [ ] Modo Paper desabilitado se quiser operar REAL

---

## 🚨 Erros Comuns e Soluções

### **Erro: "Invalid API-key, IP, or permissions for action" (401)**

**Causas:**
1. ❌ API Key não tem `Enable Futures` ativado
2. ❌ API Key não tem `Enable Trading` ativado
3. ❌ IP Whitelist bloqueando o acesso do Supabase
4. ❌ API Key ou Secret incorretos/incompletos

**Solução:**
1. Exclua a API Key antiga na Binance
2. Crie uma nova seguindo o passo a passo acima
3. **GARANTA** que `Enable Futures` e `Enable Trading` estejam ativos
4. Use "Unrestricted" para IP Whitelist

### **Erro: "Timestamp for this request was 1000ms ahead of the server's time"**

**Causa:** Relógio do sistema desincronizado

**Solução:**
- Este erro é gerenciado automaticamente pelo sistema
- Se persistir, entre em contato com o suporte

### **Erro: "Insufficient balance" (Saldo insuficiente)**

**Causa:** Saldo na carteira Futures está zerado ou insuficiente

**Solução:**
1. Acesse [Binance Futures](https://www.binance.com/en/futures/BTCUSDT)
2. Clique em **Transfer** (Transferir)
3. Transfira USDT da carteira **Spot** para **USD-M Futures**
4. Aguarde 1-2 minutos para o saldo sincronizar

---

## 📞 Suporte

Se após seguir este guia o problema persistir:

1. Verifique os **logs do sistema** (painel de Status)
2. Confira se o bot está em modo **PAPER** ou **REAL**
3. Teste a função "Sincronizar Saldo" para garantir que o sistema vê seu saldo
4. Envie um print dos erros no console para análise

---

## 🔐 Segurança das Chaves

**NUNCA:**
- ❌ Compartilhe sua API Key/Secret publicamente
- ❌ Ative `Enable Withdrawals` (não é necessário)
- ❌ Use a mesma API Key em múltiplos sistemas

**SEMPRE:**
- ✅ Mantenha as chaves em local seguro
- ✅ Use autenticação de dois fatores (2FA)
- ✅ Crie API Keys separadas para cada bot/sistema
- ✅ Revogue API Keys antigas que não usa mais

---

**Boa sorte com suas operações! 🚀📈**
