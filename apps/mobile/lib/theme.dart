import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

const _seed = Color(0xFF6D5AE6);
const _seedBright = Color(0xFF8B7CF0);
const _hot = Color(0xFFE879F9);

/// Light surfaces — soft lilac page, white cards (readable body ink).
ColorScheme _lightScheme() {
  const ink = Color(0xFF1A1430);
  const page = Color(0xFFF5F3FB);
  const card = Color(0xFFFFFFFF);
  const muted = Color(0xFF5B5678);
  return const ColorScheme(
    brightness: Brightness.light,
    primary: _seed,
    onPrimary: Colors.white,
    secondary: _seed,
    onSecondary: Colors.white,
    tertiary: _hot,
    onTertiary: Color(0xFF2A1438),
    error: Color(0xFFB42318),
    onError: Colors.white,
    surface: page,
    onSurface: ink,
    onSurfaceVariant: muted,
    surfaceContainerHighest: Color(0xFFE8E4F4),
    surfaceContainerHigh: Color(0xFFEEEAF8),
    surfaceContainer: card,
    surfaceContainerLow: Color(0xFFFAF8FF),
    outline: Color(0xFFC8C2D8),
    outlineVariant: Color(0xFFE0DBEC),
    shadow: Color(0xFF1A1430),
    scrim: Color(0xFF1A1430),
    inverseSurface: Color(0xFF2A2438),
    onInverseSurface: Color(0xFFF0EEF8),
    inversePrimary: _seedBright,
    primaryContainer: Color(0xFFE4DEFF),
    onPrimaryContainer: Color(0xFF1A1430),
  );
}

/// Dark surfaces — aligned with desktop night shell.
ColorScheme _darkScheme() {
  const elevated = Color(0xFF12181F);
  const panel = Color(0xFF171E27);
  const panel2 = Color(0xFF1C2530);
  const text = Color(0xFFE8EEF4);
  const muted = Color(0xFF8B9AAB);
  return const ColorScheme(
    brightness: Brightness.dark,
    primary: _seedBright,
    onPrimary: Color(0xFF1A1430),
    secondary: _seedBright,
    onSecondary: Color(0xFF1A1430),
    tertiary: _hot,
    onTertiary: Color(0xFF1A1430),
    error: Color(0xFFF97066),
    onError: Color(0xFF1A1430),
    surface: elevated,
    onSurface: text,
    onSurfaceVariant: muted,
    surfaceContainerHighest: panel2,
    surfaceContainerHigh: panel,
    surfaceContainer: panel,
    surfaceContainerLow: elevated,
    outline: Color(0xFF2A3542),
    outlineVariant: Color(0xFF24303C),
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: Color(0xFFE8EEF4),
    onInverseSurface: Color(0xFF12181F),
    inversePrimary: _seed,
    primaryContainer: Color(0xFF3A3270),
    onPrimaryContainer: text,
  );
}

ThemeData buildEnvoyHomeTheme({Brightness brightness = Brightness.light}) {
  final isDark = brightness == Brightness.dark;
  final scheme = isDark ? _darkScheme() : _lightScheme();
  final scaffold = isDark ? const Color(0xFF0C1117) : const Color(0xFFF0EEF8);
  final cardFill = isDark ? const Color(0xFF171E27) : Colors.white;
  final inputFill = isDark ? const Color(0xFF1C2530) : Colors.white;
  final navBg = isDark ? const Color(0xFF12181F) : Colors.white;
  final muted = scheme.onSurfaceVariant;

  final baseTypo = Typography.material2021(platform: TargetPlatform.iOS);
  // Critical: use white typography for dark — `.black` leaves dark ink on dark UI.
  final textTheme = (isDark ? baseTypo.white : baseTypo.black).apply(
    bodyColor: scheme.onSurface,
    displayColor: scheme.onSurface,
    fontFamily: 'SF Pro Text',
  );

  final shape16 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(16));
  final shape14 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: scaffold,
    canvasColor: scaffold,
    cardColor: cardFill,
    dividerColor: muted.withValues(alpha: isDark ? 0.28 : 0.16),
    textTheme: textTheme,
    primaryTextTheme: textTheme,
    iconTheme: IconThemeData(color: scheme.onSurface),
    primaryIconTheme: IconThemeData(color: scheme.primary),
    appBarTheme: AppBarTheme(
      backgroundColor: scaffold,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: isDark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
      titleTextStyle: textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
        color: scheme.onSurface,
      ),
      iconTheme: IconThemeData(color: scheme.onSurface),
      actionsIconTheme: IconThemeData(color: scheme.onSurface),
    ),
    cardTheme: CardThemeData(
      color: cardFill,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: muted.withValues(alpha: isDark ? 0.28 : 0.14)),
      ),
      margin: EdgeInsets.zero,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: scheme.onSurfaceVariant,
      textColor: scheme.onSurface,
      titleTextStyle: textTheme.titleMedium?.copyWith(color: scheme.onSurface),
      subtitleTextStyle:
          textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.primary.withValues(alpha: isDark ? 0.22 : 0.1),
      selectedColor: scheme.primary.withValues(alpha: isDark ? 0.35 : 0.18),
      disabledColor: muted.withValues(alpha: 0.12),
      labelStyle: TextStyle(
        color: scheme.onSurface,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      secondaryLabelStyle: TextStyle(color: scheme.onSurface),
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: cardFill,
      surfaceTintColor: Colors.transparent,
      textStyle: textTheme.bodyMedium?.copyWith(color: scheme.onSurface),
      labelTextStyle: WidgetStatePropertyAll(
        textTheme.bodyMedium?.copyWith(color: scheme.onSurface),
      ),
      shape: shape14,
      elevation: 8,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: cardFill,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: textTheme.titleLarge?.copyWith(color: scheme.onSurface),
      contentTextStyle: textTheme.bodyMedium?.copyWith(color: scheme.onSurface),
      shape: shape16,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: cardFill,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: cardFill,
    ),
    dividerTheme: DividerThemeData(
      color: muted.withValues(alpha: isDark ? 0.28 : 0.16),
      thickness: 1,
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: scheme.primary,
      unselectedLabelColor: scheme.onSurfaceVariant,
      indicatorColor: scheme.primary,
      dividerColor: muted.withValues(alpha: isDark ? 0.28 : 0.16),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: navBg,
      surfaceTintColor: Colors.transparent,
      indicatorColor: scheme.primary.withValues(alpha: isDark ? 0.28 : 0.16),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return IconThemeData(color: scheme.primary);
        }
        return IconThemeData(color: scheme.onSurfaceVariant);
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return textTheme.labelMedium?.copyWith(
          fontWeight: FontWeight.w600,
          color: selected ? scheme.primary : scheme.onSurfaceVariant,
        );
      }),
      height: 68,
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: scaffold,
      indicatorColor: scheme.primary.withValues(alpha: isDark ? 0.28 : 0.16),
      selectedIconTheme: IconThemeData(color: scheme.primary),
      unselectedIconTheme: IconThemeData(color: scheme.onSurfaceVariant),
      selectedLabelTextStyle: textTheme.labelMedium?.copyWith(
        color: scheme.primary,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelTextStyle: textTheme.labelMedium?.copyWith(
        color: scheme.onSurfaceVariant,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: inputFill,
      hintStyle: textTheme.bodyMedium?.copyWith(
        color: scheme.onSurfaceVariant.withValues(alpha: 0.7),
      ),
      labelStyle: textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: muted.withValues(alpha: isDark ? 0.35 : 0.22),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.primary, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        foregroundColor: scheme.onPrimary,
        backgroundColor: scheme.primary,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: shape14,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: scheme.onSurface,
        side: BorderSide(color: muted.withValues(alpha: isDark ? 0.4 : 0.35)),
        shape: shape14,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: scheme.primary),
    ),
    dropdownMenuTheme: DropdownMenuThemeData(
      textStyle: textTheme.bodyMedium?.copyWith(color: scheme.onSurface),
      menuStyle: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(cardFill),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),
    menuTheme: MenuThemeData(
      style: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(cardFill),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return scheme.onPrimary;
          return scheme.onSurface;
        }),
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return scheme.primary;
          return Colors.transparent;
        }),
        side: WidgetStatePropertyAll(
          BorderSide(color: muted.withValues(alpha: isDark ? 0.4 : 0.3)),
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: isDark ? const Color(0xFF1C2530) : const Color(0xFF2A2438),
      contentTextStyle: textTheme.bodyMedium?.copyWith(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) {
        if (s.contains(WidgetState.selected)) return scheme.onPrimary;
        return scheme.onSurfaceVariant;
      }),
      trackColor: WidgetStateProperty.resolveWith((s) {
        if (s.contains(WidgetState.selected)) {
          return scheme.primary.withValues(alpha: 0.55);
        }
        return muted.withValues(alpha: 0.35);
      }),
    ),
  );
}

ThemeData buildEnvoyHomeLightTheme() =>
    buildEnvoyHomeTheme(brightness: Brightness.light);

ThemeData buildEnvoyHomeDarkTheme() =>
    buildEnvoyHomeTheme(brightness: Brightness.dark);
