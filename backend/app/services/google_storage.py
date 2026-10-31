class GoogleStorage:
    def __init__(self, config=None):
        if config:
            self.init(config)
        else:
            self.client = None
            self.bucket = None
            self.config = None

    def init(self, config):
        """配置初始化"""
        from google.cloud import storage

        self.client = storage.Client.from_service_account_json(
            config["GOOGLE_STORAGE_MOEFLOW_VISION_TMP"]["JSON"]
        )
        self.bucket = self.client.bucket(
            config["GOOGLE_STORAGE_MOEFLOW_VISION_TMP"]["BUCKET_NAME"]
        )
        self.config = config

    def upload(self, path, filename, file):
        """上传文件；仅在真正执行 OCR 时加载可选 Google SDK 与凭据。"""
        if self.bucket is None:
            self.init(self.config)
        blob = self.bucket.blob(path + filename)
        blob.upload_from_file(file)
        return blob
