import { renderMarkdown } from './markdown.js';
import { requestJson } from './api.js';
import { safeUrl } from './model.js';

export function mountAssistant({ context, apply }) {
  const host = document.createElement('aside');
  host.className = 'assistant-widget';
  document.body.append(host);
  let messages = [], busy = false, open = false, error = '', draft = '', epoch = 0;
  const ar = () => context().language === 'ar';
  const label = (en, arabic) => ar() ? arabic : en;
  function closeChat() { open = false; paint(); host.querySelector('.assistant-toggle').focus(); }
  function paint() {
    host.replaceChildren();
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'assistant-toggle';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(icon.namespaceURI, 'path');
    path.setAttribute('d', 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z M7 9h10 M7 13h6');
    icon.append(path);
    const toggleLabel = document.createElement('span'); toggleLabel.textContent = label('Chat with AgriLens AI', 'دردشة أجريلينس بالذكاء الاصطناعي');
    toggle.append(icon, toggleLabel);
    toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-controls', 'assistant-panel');
    toggle.onclick = () => { open = !open; paint(); if (open) host.querySelector('textarea').focus(); };
    host.append(toggle);
    if (!open) return;
    const panel = document.createElement('section'); panel.id = 'assistant-panel'; panel.setAttribute('aria-label', label('AgriLens assistant', 'مساعد أجريلينس'));
    const header = document.createElement('div'); header.className = 'assistant-header';
    const title = document.createElement('h2'); title.textContent = label('AgriLens AI assistant', 'مساعد أجريلينس الذكي');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'assistant-close'; close.textContent = '×';
    close.setAttribute('aria-label', label('Close chat', 'إغلاق الدردشة')); close.onclick = closeChat;
    header.append(title, close); panel.append(header);
    panel.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); closeChat(); } };
    const log = document.createElement('div'); log.className = 'assistant-log'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
    for (const message of messages) {
      const item = document.createElement('div'); item.className = `assistant-message ${message.role}`; item.dir = 'auto';
      if (message.role === 'assistant') item.append(renderMarkdown(message.text));
      else item.textContent = message.text;
      log.append(item);
      for (const [index, source] of (message.sources || []).entries()) {
        const url = safeUrl(source.url); if (!url) continue;
        const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = source.title || `${label('Source', 'المصدر')} ${index + 1}`; log.append(link);
      }
    }
    if (busy) { const p = document.createElement('p'); p.textContent = label('Thinking…', 'جارٍ التفكير…'); log.append(p); }
    panel.append(log);
    if (error) { const p = document.createElement('p'); p.setAttribute('role', 'alert'); p.textContent = error; panel.append(p); }
    const form = document.createElement('form');
    const inputLabel = document.createElement('label'); inputLabel.htmlFor = 'assistant-question'; inputLabel.textContent = label('Your question', 'سؤالك');
    const input = document.createElement('textarea'); input.id = 'assistant-question'; input.maxLength = 4000; input.rows = 2; input.required = true; input.value = draft; input.disabled = busy; input.dir = 'auto';
    function sizeInput() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; }
    input.oninput = () => { draft = input.value; sizeInput(); };
    input.onkeydown = event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!busy && input.value.trim()) form.requestSubmit(); }
    };
    const send = document.createElement('button'); send.type = 'submit'; send.disabled = busy; send.textContent = label('Send', 'إرسال');
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = label('New chat', 'محادثة جديدة'); clear.onclick = () => { epoch++; busy = false; messages = []; draft = ''; error = ''; paint(); host.querySelector('textarea').focus(); };
    const actions = document.createElement('div'); actions.className = 'assistant-actions'; actions.append(send, clear);
    form.append(inputLabel, input, actions);
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !draft.trim()) return;
      const snapshot = context();
      if (!snapshot.config) { error = label('Wait for crop choices to load.', 'انتظر تحميل المحاصيل.'); paint(); return; }
      const current = ++epoch;
      messages.push({ role: 'user', text: draft.trim() }); draft = ''; busy = true; error = ''; paint();
      try {
        const history = messages.slice(-19).map(({ role, text }) => ({ role, text }));
        const { data } = await requestJson('/api/assistant', { body: { messages: history, context: snapshot }, timeoutMs: 50000 });
        if (current !== epoch) return;
        if (typeof data.reply !== 'string' || data.reply.length > 20000) throw new Error(label('The assistant returned an incomplete answer.', 'ردّ المساعد غير مكتمل.'));
        messages.push({ role: 'assistant', text: data.reply, sources: Array.isArray(data.sources) ? data.sources : [] });
        if (data.action) {
          if (JSON.stringify(context()) !== JSON.stringify(snapshot)) messages.push({ role: 'assistant', text: label('Your page changed while I was answering. Ask again to apply choices to the current page.', 'تغيّرت الصفحة أثناء الرد. أعد الطلب لتطبيق الاختيارات على الصفحة الحالية.') });
          else await apply(data.action);
        }
      } catch (failure) { if (current === epoch) error = failure.message; }
      finally { if (current === epoch) { busy = false; paint(); host.querySelector('textarea')?.focus(); host.querySelector('.assistant-log')?.scrollTo(0, 100000); } }
    };
    panel.append(form); host.append(panel);
    sizeInput();
  }
  paint();
  return { refresh: paint };
}
