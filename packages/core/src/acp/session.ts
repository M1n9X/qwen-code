/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { AgentState, Message, ToolCall, ToolResult } from './types.js';
import { ProviderRegistry } from '../provider/registry.js';
import { Provider } from '../provider/types.js';

export class ACPSessionManager extends EventEmitter {
  public id: string;
  public state: AgentState = 'pending';
  public messages: Message[] = [];
  
  private providerRegistry: ProviderRegistry;
  private currentProviderId?: string;
  private currentModelId?: string;

  constructor(id: string, providerRegistry: ProviderRegistry) {
    super();
    this.id = id;
    this.providerRegistry = providerRegistry;
  }

  public setModel(providerId: string, modelId: string) {
    const provider = this.providerRegistry.get(providerId);
    if (!provider) throw new Error(`Provider ${providerId} not found`);
    if (!provider.models[modelId]) throw new Error(`Model ${modelId} not found in provider ${providerId}`);
    
    this.currentProviderId = providerId;
    this.currentModelId = modelId;
  }

  public async addUserMessage(content: string): Promise<void> {
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.messages.push(message);
    this.emit('message.created', message);
    
    // Transition to running state to process the message
    await this.run();
  }

  private async run() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.emit('state.changed', this.state);

    try {
      if (!this.currentProviderId || !this.currentModelId) {
        throw new Error('No model configured for session');
      }

      const provider = this.providerRegistry.get(this.currentProviderId)!;
      // In a real implementation, we would call the provider here to stream the response
      // For now, we stub this out as part of the refactor
      
      // TODO: Implement actual LLM call loop with tool handling
      // const response = await provider.languageModel(this.currentModelId).doGenerate(...)
      
      this.state = 'completed';
      this.emit('state.changed', this.state);
    } catch (error) {
      this.state = 'error';
      this.emit('state.changed', this.state);
      this.emit('error', error);
    }
  }
}
