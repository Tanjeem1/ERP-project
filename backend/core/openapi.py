from drf_spectacular.extensions import OpenApiAuthenticationExtension


class CachedJWTAuthenticationExtension(OpenApiAuthenticationExtension):
    target_class = "core.authentication.CachedJWTAuthentication"
    name = "cookieAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "cookie", "name": "nexusledger_access"}

    def get_security_requirement(self, auto_schema):
        return [{self.name: []}, {"bearerAuth": []}]
