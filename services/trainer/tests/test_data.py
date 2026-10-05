from trainer.data import (
    conversation_to_rows,
    merge_system_prompt,
    split_records,
    to_training_rows,
)


def test_split_is_deterministic_and_disjoint():
    records = [{"text": str(i)} for i in range(100)]
    train, evals = split_records(records, sample_count=100)
    assert len(evals) == 10 and len(train) == 90
    assert {r["text"] for r in train}.isdisjoint({r["text"] for r in evals})
    assert split_records(records, 100) == (train, evals)


def test_small_datasets_have_no_eval_split():
    records = [{"text": str(i)} for i in range(20)]
    train, evals = split_records(records, sample_count=20)
    assert evals == [] and len(train) == 20


def test_prompt_completion_becomes_conversational():
    rows = to_training_rows([{"prompt": "Q", "completion": "A"}], "prompt_completion", True)
    assert rows == [
        {
            "prompt": [{"role": "user", "content": "Q"}],
            "completion": [{"role": "assistant", "content": "A"}],
        }
    ]


def test_conversations_expand_to_one_row_per_assistant_turn():
    messages = [
        {"role": "system", "content": "S"},
        {"role": "user", "content": "u1"},
        {"role": "assistant", "content": "a1"},
        {"role": "user", "content": "u2"},
        {"role": "assistant", "content": "a2"},
    ]
    rows = conversation_to_rows(messages)
    assert [row["completion"][0]["content"] for row in rows] == ["a1", "a2"]
    assert rows[1]["prompt"] == messages[:4]


def test_system_prompt_is_merged_for_models_without_system_role():
    messages = [
        {"role": "system", "content": "Sois bref."},
        {"role": "user", "content": "Bonjour"},
        {"role": "assistant", "content": "Salut"},
    ]
    assert merge_system_prompt(messages) == [
        {"role": "user", "content": "Sois bref.\n\nBonjour"},
        {"role": "assistant", "content": "Salut"},
    ]
    rows = to_training_rows([{"messages": messages}], "chat", supports_system_prompt=False)
    assert rows[0]["prompt"][0]["role"] == "user"


def test_text_rows_are_passed_through():
    assert to_training_rows([{"text": "abc"}], "text", True) == [{"text": "abc"}]


def test_thousands_grouping_keeps_other_commas():
    from trainer.train import _thousands

    assert _thousands(1_234_567) == "1 234 567"
    assert f"LoRA r=8, alpha=16 : {_thousands(16384)}" == "LoRA r=8, alpha=16 : 16 384"
