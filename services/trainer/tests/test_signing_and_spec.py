from trainer.signing import sign
from trainer.spec import TrainingSpec, eval_split_size

from .conftest import make_spec


def test_signature_matches_web_app_vector():
    # Same vector as apps/web/src/server/trainer-signature.test.ts
    body = b'{"jobId":"x","seq":1}'
    assert (
        sign(body, "callback-secret", 1_800_000_000)
        == "sha256=b69517110157ca68f39179c47756c7ee7014e5e9f714b7497c954b010775490b"
    )


def test_spec_round_trips_with_camel_case():
    spec = make_spec()
    assert spec.hyperparameters.lora_rank == 8
    dumped = spec.model_dump_json(by_alias=True)
    assert '"loraRank":8' in dumped
    assert TrainingSpec.model_validate_json(dumped) == spec


def test_eval_split_rule_matches_web_app():
    assert eval_split_size(20) == 0
    assert eval_split_size(1000) == 100
    assert eval_split_size(10_000) == 200
