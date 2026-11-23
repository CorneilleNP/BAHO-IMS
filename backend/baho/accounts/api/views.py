from django.conf import settings
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from baho.core.access import RoleCode
from baho.core.permissions import HasAnyRole

from .. import selectors, services
from ..throttles import LoginEmailThrottle, LoginIPThrottle, PasswordChangeThrottle
from .serializers import (
    AccessTokenSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    MeSerializer,
    RefreshRequestSerializer,
    ResetPasswordSerializer,
    RoleSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


def _set_refresh_cookie(response: Response, refresh: str) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


def _is_mobile(request) -> bool:
    """The Android app has no browser cookie jar shared with the site: it keeps the
    refresh token in app storage and sends `X-Baho-Client: mobile`."""
    return request.headers.get("X-Baho-Client", "").lower() == "mobile"


def _issue_refresh(request, response: Response, refresh: str) -> None:
    """Hand the refresh token to the client: httpOnly cookie for browsers, body for the app."""
    if _is_mobile(request):
        response.data["refresh"] = refresh
    else:
        _set_refresh_cookie(response, refresh)


def _refresh_from(request) -> str | None:
    return request.COOKIES.get(settings.REFRESH_COOKIE_NAME) or request.data.get("refresh")


class LoginView(TokenObtainPairView):
    """Returns the access token in the body; the refresh token only as an httpOnly cookie."""

    serializer_class = LoginSerializer
    throttle_classes = [LoginIPThrottle, LoginEmailThrottle]

    @extend_schema(responses=AccessTokenSerializer)
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            _issue_refresh(request, response, response.data.pop("refresh"))
        return response


class RefreshView(APIView):
    """Issues a new access token (and rotates the refresh cookie). Old refresh is blacklisted."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=RefreshRequestSerializer, responses=AccessTokenSerializer)
    def post(self, request):
        refresh = _refresh_from(request)
        if not refresh:
            return Response({"detail": "Not signed in."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = TokenRefreshSerializer(data={"refresh": refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            response = Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_refresh_cookie(response)
            return response
        data = dict(serializer.validated_data)
        response = Response({"access": data["access"]})
        _issue_refresh(request, response, data.get("refresh", refresh))
        return response


class LogoutView(APIView):
    """Blacklists the refresh token so it can no longer be used, and clears the cookie."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=RefreshRequestSerializer, responses={204: None})
    def post(self, request):
        refresh = _refresh_from(request)
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass  # already expired or revoked: logging out is still a success
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class MeView(APIView):
    @extend_schema(responses=MeSerializer)
    def get(self, request):
        return Response(MeSerializer(request.user).data)


class ChangePasswordView(APIView):
    """The signed-in user changes their own password; other sessions are signed out."""

    throttle_classes = [PasswordChangeThrottle]

    @extend_schema(request=ChangePasswordSerializer, responses=AccessTokenSerializer)
    def post(self, request):
        data = ChangePasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.change_own_password(request.user, **data.validated_data)
        # Every old refresh token was revoked: hand this browser a fresh session.
        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token)})
        _issue_refresh(request, response, str(refresh))
        return response


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Administrators manage user accounts, roles and stations here."""

    serializer_class = UserSerializer
    permission_classes = [HasAnyRole(RoleCode.ADMIN)]

    def get_queryset(self):
        active = self.request.query_params.get("is_active")
        return selectors.user_list(
            search=self.request.query_params.get("search", "").strip(),
            active=None if active in (None, "") else active.lower() == "true",
        )

    @extend_schema(
        parameters=[
            OpenApiParameter("search", str),
            OpenApiParameter("is_active", bool),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=UserCreateSerializer, responses={201: UserSerializer})
    def create(self, request):
        data = UserCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.create_user(**data.validated_data)
        user = selectors.user_list().get(pk=user.pk)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=UserUpdateSerializer, responses=UserSerializer)
    def partial_update(self, request, pk=None):
        user = self.get_object()
        data = UserUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        services.update_user(user, acting_user=request.user, **data.validated_data)
        return Response(UserSerializer(selectors.user_list().get(pk=user.pk)).data)

    @extend_schema(request=ResetPasswordSerializer, responses=UserSerializer)
    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        data = ResetPasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.reset_password(user, **data.validated_data)
        return Response(UserSerializer(selectors.user_list().get(pk=user.pk)).data)

    @extend_schema(responses=RoleSerializer(many=True))
    @action(detail=False, methods=["get"], pagination_class=None)
    def roles(self, request):
        return Response(RoleSerializer(selectors.active_roles(), many=True).data)
