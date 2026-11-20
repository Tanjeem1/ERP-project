from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle


class RedisRateThrottle(SimpleRateThrottle):
    def get_rate(self):
        scope = getattr(self, "scope", None)
        if scope:
            return self.THROTTLE_RATES.get(scope)
        request = getattr(self, "request", None)
        if request is None:
            return self.THROTTLE_RATES["user"]
        return self.THROTTLE_RATES["user" if request.user.is_authenticated else "anon"]

    def allow_request(self, request, view):
        self.request = request
        self.scope = getattr(view, "throttle_scope", None)
        self.rate = self.get_rate()
        if self.rate is None:
            return True
        self.num_requests, self.duration = self.parse_rate(self.rate)
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        if hasattr(cache, "client") and hasattr(cache.client, "get_client"):
            script = """
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
            return {current, redis.call('PTTL', KEYS[1])}
            """
            current, ttl = cache.client.get_client().eval(script, 1, cache.make_key(self.key), int(self.duration * 1000))
            self.retry_after_seconds = max(0, ttl / 1000)
            return current <= self.num_requests
        self.retry_after_seconds = None
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        scope = getattr(self, "scope", None)
        if request.user.is_authenticated and scope not in {"login", "register", "sandbox", "demo_request"}:
            return f"throttle:{scope or 'user'}:user:{request.user.pk}"
        return f"throttle:{scope or 'anon'}:ip:{self.get_ident(request)}"

    def wait(self):
        if self.retry_after_seconds is not None:
            return self.retry_after_seconds
        return super().wait()
