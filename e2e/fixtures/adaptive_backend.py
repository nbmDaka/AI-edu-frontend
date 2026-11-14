"""Run from the backend directory, with that directory in PYTHONPATH.
Starts real Django against a fresh temporary database; does not load backend .env.
"""
import os
import json
import tempfile
from pathlib import Path

os.environ['DEBUG'] = 'true'
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
from django.conf import settings

sandbox = Path(tempfile.mkdtemp(prefix='aiedu-adaptive-'))
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': sandbox / 'integration.sqlite3'}}
settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
settings.STORAGES = {'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}, 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}}
settings.MEDIA_ROOT = sandbox / 'media'
settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
settings.CSRF_TRUSTED_ORIGINS = ['http://127.0.0.1:5178', 'http://127.0.0.1:5187', 'http://127.0.0.1:8017']
settings.ALLOWED_HOSTS = ['127.0.0.1', 'localhost']
import django
django.setup()
from django.core.management import call_command
from apps.accounts.models import User
from apps.education.models import LearningTrack, Course, Module, Lesson, LearningItem
from apps.assessments.models import Test, Question, Option
from apps.lessons.models import LessonBlock
from apps.activities.services import save_draft, publish_draft

call_command('migrate', verbosity=0)
track = LearningTrack.objects.create(title='Integration track', is_published=True)
course = Course.objects.create(title='Интеграционный курс', learning_track=track, is_published=True, adaptive_learning_enabled=True)
first = Module.objects.create(course=course, title='Первый модуль', position=0, is_published=True)
second = Module.objects.create(course=course, title='Второй модуль', position=1, is_published=True)

def lecture(module, title):
    lesson = Lesson.objects.create(module=module, title=title, status='PUBLISHED')
    item = LearningItem.objects.create(module=module, title=title, type='LECTURE', status='PUBLISHED', lesson=lesson)
    LessonBlock.objects.create(lesson=lesson, type='TEXT', position=0, content='Материал для повторения. Прочитайте этот текст.')
    return item

entry = lecture(first, 'Лекция для повторения')
next_entry = lecture(second, 'Лекция следующего модуля')
practice = LearningItem.objects.create(module=first, title='Повторение практики', type='PRACTICE', status='PUBLISHED', position=1)
save_draft(practice, None, {'practice_type': 'guided_assignment', 'plugin_version': '1.0.0',
    'title': practice.title, 'description': '', 'config': {
        'instructions': [json.dumps({'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Проверьте учебный пример и напишите отчёт.'}]}]})],
        'criteria': [{'title': title, 'description': '', 'is_required': True} for title in ['Проверить пример', 'Проверить результат']]}})
publish_draft(practice)
quiz = Test.objects.create(title='Итоговый тест', is_published=True)
item = LearningItem.objects.create(module=first, title='Итоговый тест', type='TEST', test=quiz, status='PUBLISHED', position=2)
for i, competency in enumerate(['Теория', 'Теория', 'Применение', 'Применение']):
    question = Question.objects.create(test=quiz, text=f'Вопрос {i + 1}', position=i, competency=competency, points=9 if i == 3 else 1)
    Option.objects.create(question=question, text='Верный ответ', position=0, is_correct=True)
    Option.objects.create(question=question, text='Неверный ответ', position=1, is_correct=False)
User.objects.create_user(email='integration-admin@example.test', password='Integration1234!', role='ADMIN')
for width in [1280, 390]:
    User.objects.create_user(email=f'integration-{width}@example.test', password='Integration1234!', learning_track=track)
fixture = {'course': course.short_id, 'lecture': entry.short_id, 'practice': practice.short_id, 'test': item.short_id, 'next': next_entry.short_id}
print('AI_EDU_INTEGRATION_FIXTURE=' + json.dumps(fixture), flush=True)
print(f'Temporary database: {sandbox}', flush=True)
call_command('runserver', '127.0.0.1:8017', use_reloader=False)
