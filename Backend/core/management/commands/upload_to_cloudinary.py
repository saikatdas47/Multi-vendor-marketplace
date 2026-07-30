import os
import requests
from django.conf import settings
from django.core.management.base import BaseCommand
from django.apps import apps
from django.db import models

class Command(BaseCommand):
    help = "Upload local media files to Cloudinary using unsigned preset via REST API"

    def handle(self, *args, **options):
        self.stdout.write("🚀 Starting upload via REST API with unsigned preset...")
        media_root = settings.MEDIA_ROOT

        cloud_name = "dcm3sr4ec"
        preset_name = "commercex_unsigned"          # Your unsigned preset name
        upload_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload"

        for model in apps.get_models():
            for field in model._meta.get_fields():
                if isinstance(field, models.FileField):
                    self.stdout.write(f"🔍 Checking {model.__name__}.{field.name} ...")
                    for obj in model.objects.all():
                        file_field = getattr(obj, field.name)
                        if file_field and file_field.name:
                            local_path = os.path.join(media_root, file_field.name)
                            if os.path.exists(local_path):
                                try:
                                    with open(local_path, 'rb') as f:
                                        files = {'file': f}
                                        data = {
                                            'upload_preset': preset_name,
                                            'folder': 'media/products/2026/07',
                                            # Only allowed parameters for unsigned upload
                                        }
                                        response = requests.post(upload_url, files=files, data=data)
                                        if response.status_code == 200:
                                            result = response.json()
                                            public_id = result['public_id']
                                            # Update database
                                            file_field.name = public_id
                                            obj.save(update_fields=[field.name])
                                            self.stdout.write(f"✅ Uploaded: {local_path} -> {public_id}")
                                        else:
                                            self.stdout.write(f"❌ Failed: {local_path} -> Status {response.status_code}: {response.text}")
                                except Exception as e:
                                    self.stdout.write(f"❌ Exception: {local_path} -> {e}")
                            else:
                                self.stdout.write(f"⏩ File not found: {local_path}")
                        else:
                            pass
        self.stdout.write("🎉 All files uploaded to Cloudinary!")