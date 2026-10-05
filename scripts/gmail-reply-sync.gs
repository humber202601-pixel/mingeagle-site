const MING_EAGLE_ENDPOINT = 'https://app.mingeagle.com/api/inbound/gmail-reply';
const SYNC_LOOKBACK_DAYS = 7;
const MAX_MESSAGES_PER_RUN = 50;
const PROCESSED_IDS_KEY = 'MING_EAGLE_PROCESSED_MESSAGE_IDS';
const INBOUND_KEY_PROPERTY = 'INBOUND_REPLY_KEY';

function syncMingEagleReplies() {
  const props = PropertiesService.getScriptProperties();
  const inboundKey = props.getProperty(INBOUND_KEY_PROPERTY);
  if (!inboundKey) throw new Error('Missing Script Property: ' + INBOUND_KEY_PROPERTY);

  const processed = loadProcessedIds_(props);
  const query = `in:inbox newer_than:${SYNC_LOOKBACK_DAYS}d`;
  const threads = GmailApp.search(query, 0, 100);
  let checked = 0;
  let imported = 0;
  let ignored = 0;
  let failed = 0;

  outer:
  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const message of messages) {
      if (checked >= MAX_MESSAGES_PER_RUN) break outer;
      checked++;

      const messageId = message.getId();
      if (processed.has(messageId)) continue;

      const fromEmail = extractEmail_(message.getFrom());
      if (!fromEmail || fromEmail.toLowerCase() === 'mingeaglecommerce@gmail.com') {
        rememberProcessed_(processed, messageId);
        continue;
      }

      const payload = {
        fromEmail: fromEmail,
        fromName: message.getFrom(),
        subject: message.getSubject() || '',
        body: cleanReplyBody_(message.getPlainBody() || ''),
        gmailMessageId: messageId,
        gmailThreadId: thread.getId(),
        receivedAt: message.getDate().toISOString(),
      };

      if (!payload.body) {
        rememberProcessed_(processed, messageId);
        ignored++;
        continue;
      }

      try {
        const response = UrlFetchApp.fetch(MING_EAGLE_ENDPOINT, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-inbound-key': inboundKey },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        const code = response.getResponseCode();
        const data = JSON.parse(response.getContentText() || '{}');

        if (code >= 200 && code < 300 && data.ok) {
          rememberProcessed_(processed, messageId);
          if (data.imported) imported++;
          else ignored++;
        } else {
          failed++;
          console.log('MING EAGLE sync rejected', messageId, code, response.getContentText());
        }
      } catch (error) {
        failed++;
        console.log('MING EAGLE sync failed', messageId, error);
      }
    }
  }

  saveProcessedIds_(props, processed);
  console.log(JSON.stringify({ checked, imported, ignored, failed }));
  return { checked, imported, ignored, failed };
}

function installMingEagleTrigger() {
  const functionName = 'syncMingEagleReplies';
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === functionName) ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger(functionName).timeBased().everyMinutes(5).create();
}

function testMingEagleConnection() {
  const props = PropertiesService.getScriptProperties();
  const inboundKey = props.getProperty(INBOUND_KEY_PROPERTY);
  if (!inboundKey) throw new Error('Missing Script Property: ' + INBOUND_KEY_PROPERTY);
  const result = UrlFetchApp.fetch(MING_EAGLE_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-inbound-key': inboundKey },
    payload: JSON.stringify({}),
    muteHttpExceptions: true,
  });
  console.log(result.getResponseCode(), result.getContentText());
}

function extractEmail_(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return (match ? match[1] : String(value || '')).trim().toLowerCase();
}

function cleanReplyBody_(body) {
  let text = String(body || '').replace(/\r/g, '').trim();
  const markers = [
    /^On .+wrote:$/mi,
    /^From:\s.+$/mi,
    /^-----Original Message-----$/mi,
    /^________________________________$/mi,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  text = text.slice(0, cut).trim();
  return text.slice(0, 12000);
}

function loadProcessedIds_(props) {
  try {
    const raw = JSON.parse(props.getProperty(PROCESSED_IDS_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch (_) {
    return new Set();
  }
}

function rememberProcessed_(set, id) {
  set.add(id);
  while (set.size > 1000) set.delete(set.values().next().value);
}

function saveProcessedIds_(props, set) {
  props.setProperty(PROCESSED_IDS_KEY, JSON.stringify(Array.from(set)));
}
