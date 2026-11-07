// js/components/admin/questionUpload.js
// Upload a question file (append to or replace the pool).
import { $, showMsg } from '../../utils/dom.js';
import { AdminAPI } from '../../api/index.js';

export async function handleUploadQuestions() {
  const fileInput = $('question-file');
  if (!fileInput.files.length) return showMsg('question-msg', 'Choose a file first', false);

  const mode = $('question-mode').value; // 'append' (default) or 'replace'
  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  fd.append('mode', mode);
  const r = await AdminAPI.uploadQuestions(fd);
  showMsg('question-msg', r.msg, r.code === 0);
}
