"""Build the offline lesson data from the reviewed Markdown packages."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
MATERIALS = ROOT / 'materials'
OUTPUT = ROOT / 'web' / 'content.js'


def required(pattern, text, label, flags=0):
    match = re.search(pattern, text, flags)
    if not match:
        raise ValueError(f'Missing {label}')
    return match.group(1)


def section(body, stage, next_stage=None):
    marker = f'**{stage}.'
    if marker not in body:
        raise ValueError(f'Missing stage {stage}')
    found = body.split(marker, 1)[1]
    return found.split(f'**{next_stage}.', 1)[0] if next_stage else found


def choice(body, stage, next_stage):
    block = section(body, stage, next_stage)
    options = re.findall(r'^  \d+\. (.+)$', block, re.M)
    answer = required(r'\*\*Верно:\*\* \d+\. `([^`]+)`', block, f'{stage} answer')
    if len(options) != 4 or len(set(options)) != 4 or options.count(answer) != 1:
        raise ValueError(f'Invalid options for {stage}: {options!r}, answer={answer!r}')
    return block, options, answer


def question(block):
    return required(r'Вопрос: `([^`]+)`', block, 'question')


def text_answer(block):
    return required(r'\*\*Верно:\*\* `([^`]+)`', block, 'written answer')


def read_words(text, part):
    pattern = r'(?ms)^### (V\d{3}|\d{2})\. (.+?)\n(.*?)(?=^### |^## |\Z)'
    words = []
    for number, title, body in re.findall(pattern, text):
        prefix = f'p{part}-{number.lower()}'
        if part == 1:
            ru = required(r'\*\*Значение в этой карточке:\*\* (.+?)\.', body, prefix + ' meaning')
            source = required(r'\*\*Исходная подсказка из конспекта:\*\* (.+)', body, prefix + ' source')
            source_label = 'Из сводного конспекта; исходный скриншот не проверен'
            example = required(r'\*\*Новый ситуационный пример \[СОЗДАНО\]:\*\* (.+)', body, prefix + ' example')
            source_en = ''
        else:
            ru = required(r'\*\*Значение:\*\* (.+?)\.', body, prefix + ' meaning')
            source_en = required(r'\*\*\[СКРИНШОТ\] Исходное предложение:\*\* (.+)', body, prefix + ' source')
            source = required(r'\*\*Происхождение:.*?выделенная форма на скриншоте — `([^`]+)`', body, prefix + ' highlighted')
            source_label = 'Предложение из переданного пакета; скриншот не проверен'
            example = required(r'\*\*\[СОЗДАНО\] Ситуационный пример:\*\* (.+)', body, prefix + ' example')
        if ' — ' not in example:
            raise ValueError(f'Example missing translation: {prefix}')
        sample_en, sample_ru = example.rsplit(' — ', 1)
        _, ru_choices, ru_answer = choice(body, '1.1', '1.2')
        if ru_answer != ru:
            raise ValueError(f'Translation mismatch: {prefix}: {ru_answer!r} != {ru!r}')
        write_answer = text_answer(section(body, '1.2', '2.1'))
        context, gap_choices, gap_answer = choice(body, '2.1', '2.2')
        gap = question(context)
        context_write = text_answer(section(body, '2.2', '2.3'))
        if context_write != gap_answer:
            raise ValueError(f'Gap mismatch: {prefix}')
        translate = section(body, '2.3')
        prompt = question(translate).removeprefix('Переведите на английский: ')
        model = text_answer(translate)
        extra = re.search(r'\*\*Другие заранее проверенные варианты:\*\* ([^\n]+)', translate)
        answers = [model]
        if extra and extra.group(1).strip() != 'нет.':
            answers.extend(v.strip().strip('`') for v in extra.group(1).split(';') if v.strip())
        if title.casefold() in prompt.casefold():
            raise ValueError(f'Prompt leaks target word: {prefix}')
        words.append({
            'id': prefix, 'en': title, 'ru': ru, 'ruChoices': ru_choices,
            'gap': gap, 'gapAnswer': gap_answer, 'gapChoices': gap_choices,
            'prompt': prompt, 'answers': answers, 'known': [],
            'explain': f'{title} — {ru}. {sample_en}',
            'source': source, 'sourceEn': source_en, 'sourceLabel': source_label,
            'sampleEn': sample_en, 'sampleRu': sample_ru,
            'writeAnswers': [write_answer], 'gapAnswers': [gap_answer],
        })
    return words


def read_grammar(text, part):
    rules = []
    for number, title, body in re.findall(r'(?ms)^### (G\d{2})\. (.+?)\n(.*?)(?=^### |^## |\Z)', text):
        key = f'p{part}-{number.lower()}'
        if part == 1:
            rule = required(r'\*\*Объяснение:\*\* (.+)', body, key + ' rule')
            example = required(r'\*\*Пример перевода \[СОЗДАНО\]:\*\* (.+)', body, key + ' example')
            nuance = required(r'\*\*Типичная ошибка или нюанс:\*\* (.+)', body, key + ' nuance')
            lines = [rule, example, nuance]
            c = section(body, '3.2', '3.3')
            prompt = question(c)
            options = re.findall(r'^  \d+\. (.+)$', c, re.M)
            answer = required(r'\*\*Верно:\*\* \d+\. `([^`]+)`', c, key + ' choice answer')
            t = section(body, '3.3')
            trans_prompt = question(t).removeprefix('Переведите на английский: ')
            model = text_answer(t)
            alt = required(r'\*\*Другие заранее проверенные варианты:\*\* ([^\n]+)', t, key + ' alternatives')
            answers = [model] + ([] if alt.strip() == 'нет.' else [alt.strip().strip('`').rstrip('.')])
        else:
            lines = []
            for label in ('**Правило:**', '**Форма утверждения:**', '**Отрицание:**', '**Вопрос:**', '**[СОЗДАНО] Пример и перевод:**', '**Частая ошибка:**'):
                for line in body.splitlines():
                    if line.startswith('- ' + label):
                        lines.append(line.removeprefix('- ' + label).strip())
                        break
            c = section(body, '3.2', '3.3')
            prompt = required(r'\*\*Вопрос ученику:\*\* `([^`]+)`', c, key + ' choice question')
            options = re.findall(r'^  \d+\. (.+)$', c, re.M)
            idx = int(required(r'\*\*Ответ:\*\* (\d+)\.', c, key + ' choice index')) - 1
            answer = options[idx]
            t = section(body, '3.3')
            trans_prompt = required(r'\*\*Вопрос ученику:\*\* `([^`]+)`', t, key + ' translation prompt').removeprefix('Переведи на английский: ')
            model = required(r'\*\*Ответ:\*\* `([^`]+)`', t, key + ' translation answer')
            answers = [model]
        if len(options) != 4 or len(set(options)) != 4 or options.count(answer) != 1:
            raise ValueError(f'Invalid grammar choices: {key}')
        rules.append({
            'id': key, 'title': title, 'rule': [line.strip().strip('`') for line in lines],
            'choicePrompt': prompt, 'choiceOptions': options, 'choiceAnswer': answer,
            'prompt': trans_prompt, 'answers': answers, 'known': [],
            'explain': lines[0] if lines else '',
        })
    return rules


def main():
    parts = []
    for part, expected_words, expected_rules in ((1, 60, 16), (2, 51, 12)):
        path = MATERIALS / f'lesson-14-part-{part}.md'
        text = path.read_text()
        words, grammar = read_words(text, part), read_grammar(text, part)
        if (len(words), len(grammar)) != (expected_words, expected_rules):
            raise ValueError(f'Unexpected item count in part {part}')
        parts.append({'id': f'lesson14-part{part}', 'number': part, 'words': words, 'grammar': grammar})
    content = {'version': 2, 'lessons': [{'id': 'lesson14', 'number': 14, 'title': 'Работа и карьера', 'demo': False, 'parts': parts}]}
    OUTPUT.write_text('/* Generated from materials/lesson-14-part-*.md. Edit the source packages, then rebuild. */\nwindow.ENGLISH_CONTENT = ' + json.dumps(content, ensure_ascii=False, indent=2) + ';\n')
    print(f'Built lesson 14: {sum(len(p["words"]) for p in parts)} words/expressions, {sum(len(p["grammar"]) for p in parts)} grammar rules')


if __name__ == '__main__':
    main()
