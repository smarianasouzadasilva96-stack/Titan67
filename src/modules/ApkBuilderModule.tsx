import { AlertTriangle, CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import React, { useState } from 'react';
import { PipelineResultPanel } from '../components/PipelineResultPanel.tsx';
import { useTitan } from '../contexts/TitanContext.tsx';
import { generateWithPipeline } from '../lib/titanApi.ts';
import { recordTaskExecution } from '../lib/workspaceService.ts';
import type { GenerationResult } from '../shared/titanTypes.ts';

const AVAILABLE_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CAMERA',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE',
];

export function ApkBuilderModule() {
  const { user, capabilities, notify } = useTitan();
  const [appName, setAppName] = useState('Titan Field App');
  const [packageName, setPackageName] = useState('com.titancode.fieldapp');
  const [versionName, setVersionName] = useState('1.0.0');
  const [versionCode, setVersionCode] = useState(1);
  const [orientation, setOrientation] = useState('portrait');
  const [permissions, setPermissions] = useState<string[]>(['android.permission.INTERNET']);
  const [appDescription, setAppDescription] = useState(
    'Aplicativo Android em Kotlin com Jetpack Compose contendo tela de registro de inspeções técnicas, filtro por prioridade, validação de formulário e lista persistente em memória/SharedPreferences.',
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const togglePerm = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleGenerateAndroid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(packageName)) {
      notify('error', 'Package Name inválido', 'Use formato reverso válido, ex: com.titancode.app');
      return;
    }

    setLoading(true);
    try {
      const res = await generateWithPipeline({
        module: 'apk-builder',
        prompt: appDescription,
        explicitLanguage: 'Kotlin',
        explicitEnvironment: 'Android',
        deliveryMode: 'multi-file',
        projectTypeOverride: 'android',
        apkConfig: {
          appName,
          packageName,
          versionName,
          versionCode,
          orientation,
          permissions,
        },
      });
      setResult(res);

      if (user) {
        await recordTaskExecution({
          ownerId: user.uid,
          module: 'apk-builder',
          prompt: `${appName} (${packageName}): ${appDescription}`,
          language: 'Kotlin',
          environment: 'Android',
          status: res.status,
          validationSummary: `${res.files.length} arquivos Android gerados. Compilação binária APK: ${capabilities?.androidSdkAvailable ? 'executada' : 'SDK ausente no servidor'}.`,
        });
      }
      notify(
        'info',
        'Projeto Android Gerado',
        'Código Kotlin, Gradle e AndroidManifest completos prontos para exportação.',
      );
    } catch (err) {
      notify('error', 'Erro no APK Builder', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const sdkReady = Boolean(capabilities?.androidSdkAvailable && capabilities?.gradleAvailable && capabilities?.javaAvailable);

  return (
    <div className="space-y-6">
      {/* Honest Infrastructure Banner */}
      <div
        className={`rounded-xl border p-5 flex items-start gap-3 ${
          sdkReady
            ? 'bg-emerald-950/20 border-emerald-800/60'
            : 'bg-amber-950/20 border-amber-800/50'
        }`}
      >
        {sdkReady ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-zinc-100">
            Status da Infraestrutura de Build Android: {sdkReady ? 'JDK + Gradle + Android SDK ativos' : 'Android SDK / Gradle não instalados neste servidor'}
          </p>
          <p className="text-zinc-300 leading-relaxed">
            {sdkReady
              ? 'Ambiente pronto para compilação Gradle.'
              : 'O TITAN CODE nunca simula arquivos .apk falsos. Este módulo gera projetos Android Kotlin/Compose completos (AndroidManifest.xml, build.gradle.kts, MainActivity.kt implementada, recursos XML), valida a estrutura e exporta o pacote .zip pronto para compilar com ./gradlew assembleRelease em um ambiente com JDK 17 + Android SDK.'}
          </p>
        </div>
      </div>

      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white">
            TITAN APK Builder 2.0
          </h2>
          <p className="text-sm text-zinc-400">
            Configuração de manifesto, versão, permissões, orientação e geração de projeto Android Kotlin completo.
          </p>
        </div>

        <form onSubmit={handleGenerateAndroid} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Nome do App</label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <label className="block text-xs font-medium text-zinc-400">Package Name</label>
              <input
                type="text"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm font-mono text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Versão</label>
              <input
                type="text"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm font-mono text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Version Code</label>
              <input
                type="number"
                min={1}
                value={versionCode}
                onChange={(e) => setVersionCode(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm font-mono text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Orientação de Tela</label>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="portrait">Portrait (Retrato)</option>
                <option value="landscape">Landscape (Paisagem)</option>
                <option value="unspecified">Automática (Sensor)</option>
              </select>
            </div>
            <div className="lg:col-span-2 space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Permissões AndroidManifest</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_PERMISSIONS.map((perm) => {
                  const active = permissions.includes(perm);
                  return (
                    <button
                      key={perm}
                      type="button"
                      onClick={() => togglePerm(perm)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-mono border cursor-pointer ${
                        active
                          ? 'bg-red-600/20 border-red-600 text-white'
                          : 'bg-[#070709] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {perm.replace('android.permission.', '')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400">
              Especificação Funcional do Aplicativo
            </label>
            <textarea
              value={appDescription}
              onChange={(e) => setAppDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              <span>{loading ? 'Gerando Projeto Android...' : 'Gerar & Validar Projeto Android'}</span>
            </button>
          </div>
        </form>
      </div>

      {result && <PipelineResultPanel result={result} projectNameSuggestion={appName} />}
    </div>
  );
}
