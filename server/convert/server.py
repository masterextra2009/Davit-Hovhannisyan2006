"""
Перевод документов для приложения «Фото-Север» (05.10.2026).

Работает на VPS Cortex (46.173.18.90) рядом с Cortex, наружу — через Caddy:
https://cortex.sever-18.ru/convert/. Телефон сюда не ходит: его запрос
принимает сайт (api/v2/convert.php — проверяет вход клиента и размер) и
пересылает сюда с общим ключом. Без ключа сервис отвечает 403.

  POST /convert?to=pdf   тело — файл Word/Excel/PowerPoint/текст → PDF (LibreOffice)
  POST /convert?to=docx  тело — PDF → Word (pdf2docx; сканы так не переводятся)
  заголовки: X-Convert-Key — ключ, X-Filename — имя файла (по нему расширение)

Один перевод за раз: на сервере 1 ГБ памяти, LibreOffice берёт ~200 МБ.
"""

import hmac
import os
import shutil
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

KEY = open('/opt/convert/key').read().strip()
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT_S = 90
TO_PDF = {'doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'}
PDF_MAGIC = b'%PDF'

lock = threading.Lock()


def to_pdf(src: str, work: str) -> str:
    # Свой профиль LibreOffice на каждый перевод: общий профиль после сбоя
    # оставляет замок, и следующие переводы молча падают.
    subprocess.run(
        ['soffice', '--headless', '--norestore', '--nolockcheck',
         f'-env:UserInstallation=file://{work}/profile',
         '--convert-to', 'pdf', '--outdir', work, src],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=TIMEOUT_S, check=False,
    )
    out = os.path.splitext(src)[0] + '.pdf'
    if not os.path.exists(out):
        raise ValueError('Не удалось открыть файл — возможно, он повреждён или защищён паролем.')
    return out


def to_docx(src: str, work: str) -> str:
    import pymupdf
    from pdf2docx import Converter

    doc = pymupdf.open(src)
    if doc.needs_pass:
        raise ValueError('PDF защищён паролем — снимите пароль и попробуйте снова.')
    has_text = any(page.get_text().strip() for page in doc)
    doc.close()
    if not has_text:
        raise ValueError('В этом PDF нет текста — это скан или фото. В Word переводятся только PDF с текстом.')
    out = os.path.join(work, 'out.docx')
    conv = Converter(src)
    try:
        conv.convert(out)
    finally:
        conv.close()
    return out


class Handler(BaseHTTPRequestHandler):
    def reply(self, code: int, body: bytes, ctype: str = 'text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code: int, text: str):
        self.reply(code, text.encode('utf-8'))

    def do_POST(self):
        url = urlparse(self.path)
        if url.path.rstrip('/') != '/convert':
            return self.fail(404, 'Нет такого адреса')
        if not hmac.compare_digest(self.headers.get('X-Convert-Key', ''), KEY):
            return self.fail(403, 'Нет доступа')
        target = (parse_qs(url.query).get('to') or [''])[0]
        size = int(self.headers.get('Content-Length') or 0)
        if size <= 0 or size > MAX_BYTES:
            return self.fail(413, 'Файл больше 25 МБ — такой не перевести.')
        name = os.path.basename(self.headers.get('X-Filename', 'file')) or 'file'
        ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
        data = self.rfile.read(size)

        if target == 'pdf' and ext not in TO_PDF:
            return self.fail(415, 'В PDF переводятся файлы Word, Excel, PowerPoint и текст.')
        if target == 'docx' and not data.startswith(PDF_MAGIC):
            return self.fail(415, 'Это не PDF-файл.')
        if target not in ('pdf', 'docx'):
            return self.fail(400, 'Неизвестный перевод')

        work = tempfile.mkdtemp(prefix='cvt-')
        try:
            src = os.path.join(work, 'in.' + (ext if target == 'pdf' else 'pdf'))
            with open(src, 'wb') as f:
                f.write(data)
            with lock:
                out = to_pdf(src, work) if target == 'pdf' else to_docx(src, work)
            with open(out, 'rb') as f:
                body = f.read()
            ctype = 'application/pdf' if target == 'pdf' else \
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            self.reply(200, body, ctype)
        except ValueError as e:
            self.fail(422, str(e))
        except subprocess.TimeoutExpired:
            self.fail(504, 'Файл слишком сложный — перевод не уложился в 90 секунд.')
        except Exception as e:  # noqa: BLE001 — клиенту общий текст, причина в журнал
            print('convert error:', repr(e), flush=True)
            self.fail(500, 'Не удалось перевести файл. Попробуйте другой.')
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def log_message(self, fmt, *args):
        pass  # имён файлов клиентов в журнале не держим


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8878), Handler).serve_forever()
