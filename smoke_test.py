#!/usr/bin/env python
"""End-to-end smoke test for SonicAI.

Tests: login, upload demo WAV, generate style, generate music, create song, download files.

Usage: python smoke_test.py [--base-url http://localhost:8000/api/v1]
"""

import sys
import os
import json
import time
import argparse
import urllib.request
import urllib.error


class SmokeTester:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        self.token = None
        self.passed = 0
        self.failed = 0

    def _req(self, method: str, path: str, body: dict | None = None, expect_status: int = 200, accept: list[int] | None = None):
        url = f"{self.base}{path}"
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        data = json.dumps(body).encode("utf-8") if body else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            resp = urllib.request.urlopen(req, timeout=30)
            status = resp.status
            body_data = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            status = e.code
            body_data = e.read().decode("utf-8")

        ok_statuses = accept or [expect_status]
        return status, json.loads(body_data) if body_data else {}, status in ok_statuses

    def test(self, name: str) -> bool:
        print(f"  [{name}] ... ", end="", flush=True)
        return True

    def check(self, name: str, ok: bool, detail: str = ""):
        if ok:
            self.passed += 1
            print(f"PASS")
        else:
            self.failed += 1
            print(f"FAIL {detail}")

    def run(self):
        print("=" * 60)
        print("  SonicAI E2E Smoke Test")
        print("=" * 60)

        # 1. Login
        print("\n[1] Auth")
        status, data, _ = self._req("POST", "/auth/login", {"username": "admin", "password": "admin123"})
        self.check("Login", status == 200 and "access_token" in data, str(status))
        self.token = data.get("access_token", "")

        if not self.token:
            print("  Cannot proceed without auth token. Aborting.")
            return 1

        # 2. Health check
        print("\n[2] Health")
        status, data, _ = self._req("GET", "/../health")
        self.check("Health endpoint", status == 200, str(status))

        # 3. Model catalog
        print("\n[3] Model Catalog")
        status, data, _ = self._req("GET", "/models/")
        self.check("GET /models", status == 200 and "music_generation" in data, str(status))
        models = data.get("music_generation", [])
        mg_model = models[0]["key"] if models else "musicgen_small"
        print(f"      music_gen model: {mg_model}")

        # 4. Services status
        print("\n[4] Service Status")
        status, data, _ = self._req("GET", "/config/services")
        self.check("GET /config/services", status == 200 and "redis" in data, str(status))
        print(f"      backend={data.get('backend',{}).get('running')} redis={data.get('redis',{}).get('running')} celery={data.get('celery',{}).get('running')}")

        # 5. Prompt provider status
        print("\n[5] Prompt Provider")
        status, data, _ = self._req("GET", "/config/prompt-provider/status")
        self.check("GET /config/prompt-provider/status", status == 200 and "active" in data, str(status))
        print(f"      active={data.get('active')}")

        # 6. Upload demo WAV
        print("\n[6] Audio Upload")
        # Generate a minimal WAV for testing
        demo_wav = os.path.join(os.path.dirname(__file__), "test_demo.wav")
        self._create_test_wav(demo_wav)

        upload_status = False
        asset_id = None
        style_vector_id = None
        try:
            import io
            boundary = "----SmokeTestBoundary"
            body = io.BytesIO()
            body.write(f"--{boundary}\r\n".encode())
            body.write(f'Content-Disposition: form-data; name="file"; filename="test_demo.wav"\r\n'.encode())
            body.write(b"Content-Type: audio/wav\r\n\r\n")
            with open(demo_wav, "rb") as f:
                body.write(f.read())
            body.write(f"\r\n--{boundary}--\r\n".encode())

            url = f"{self.base}/audio/upload?processing_mode=sync"
            req = urllib.request.Request(url, data=body.getvalue(), method="POST")
            req.add_header("Authorization", f"Bearer {self.token}")
            req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
            resp = urllib.request.urlopen(req, timeout=120)
            result = json.loads(resp.read().decode())
            asset_id = result.get("asset_id")
            task_id = result.get("task_id")

            if task_id and task_id.startswith("sync-"):
                time.sleep(2)
                st_status, st_data, _ = self._req("GET", f"/audio/status/{task_id}")
                if st_data.get("style_vector"):
                    style_vector_id = st_data["style_vector"]["id"]
                    upload_status = True

            self.check("Upload + process WAV", upload_status, f"asset_id={asset_id} sv_id={style_vector_id}")
        except Exception as e:
            self.check("Upload WAV", False, str(e))

        # 7. Music generation
        print("\n[7] Music Generation")
        gen_ok = False
        music_id = None
        if style_vector_id:
            status, data, _ = self._req("POST", "/music/generate?processing_mode=sync", {
                "style_vector_id": style_vector_id,
                "text_prompt": "calm ambient test music",
                "music_gen_model": mg_model,
            })
            task_id = data.get("task_id", "")
            gen_ok = bool(task_id)

            if task_id:
                time.sleep(2)
                st_status, st_data, _ = self._req("GET", f"/music/status/{task_id}")
                music_id = st_data.get("music_id")
                gen_ok = music_id is not None
                if music_id:
                    provider = st_data.get("provider_mode", "unknown")
                    print(f"      provider_mode={provider}")
        self.check("Generate music", gen_ok, f"music_id={music_id}")

        # 8. Song creation
        print("\n[8] Song Creation")
        song_ok = False
        song_id = None
        status, data, _ = self._req("POST", "/song/create?processing_mode=sync", {
            "theme": "test peace love",
            "voice_model_id": None,
            "style_vector_id": style_vector_id,
            "reference_audio_id": None,
        })
        song_id = data.get("song_id")
        if song_id:
            time.sleep(3)
            st_status, st_data, _ = self._req("GET", f"/song/status/{song_id}")
            song_ok = st_data.get("status") in ("completed", "writing", "arranging", "singing", "mixing")
            if song_ok:
                print(f"      status={st_data.get('status')} lyrics_provider={st_data.get('lyrics_provider','')} has_vocals={st_data.get('has_vocals')}")
        self.check("Create song", song_ok, f"song_id={song_id}")

        # 9. Download
        print("\n[9] File Download")
        dl_ok = False
        if music_id:
            status, _, _ = self._req("GET", f"/music/{music_id}/download", expect_status=200)
            dl_ok = status == 200
        if song_id and not dl_ok:
            status, _, _ = self._req("GET", f"/song/{song_id}/download", expect_status=200)
            dl_ok = status == 200
        self.check("Download audio", dl_ok)

        # 10. Voice models list
        print("\n[10] Voice Models")
        status, data, _ = self._req("GET", "/voice/models")
        self.check("List voice models", status == 200 and "items" in data, str(status))
        print(f"      {data.get('total', 0)} voice models")

        # Cleanup
        if os.path.exists(demo_wav):
            os.remove(demo_wav)

        print("\n" + "=" * 60)
        total = self.passed + self.failed
        print(f"  Results: {self.passed}/{total} passed, {self.failed} failed")
        print("=" * 60)
        return 0 if self.failed == 0 else 1

    @staticmethod
    def _create_test_wav(path: str):
        """Create a minimal 1-second 16kHz mono WAV file."""
        import struct
        import wave
        with wave.open(path, "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            for i in range(16000):
                value = int(8000 * __import__("math").sin(2.0 * 3.14159 * 440 * i / 16000))
                w.writeframes(struct.pack("<h", value))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SonicAI E2E Smoke Test")
    parser.add_argument("--base-url", default="http://localhost:8000/api/v1", help="Backend API base URL")
    args = parser.parse_args()
    tester = SmokeTester(args.base_url)
    sys.exit(tester.run())
