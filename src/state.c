
#include "includes.h"



void fus_state_frame_cleanup(fus_state_frame_t *frame){
    fus_obj_cleanup(&frame->vars);
    fus_coderef_cleanup(&frame->coderef);
}

int fus_state_frame_init(fus_state_frame_t *frame, fus_code_t *code){
    fus_obj_init(&frame->vars);
    fus_coderef_init(&frame->coderef, code);
    return 0;
}


void fus_state_cleanup(fus_state_t *state){
    fus_stack_cleanup(&state->stack);
    ARRAY_FREE(fus_state_frame_t, state->frames, fus_state_frame_cleanup)
}

int fus_state_init(fus_state_t *state, fus_compiler_t *compiler){
    int err;
    state->compiler = compiler;
    err = fus_stack_init(&state->stack);
    if(err)return err;
    ARRAY_INIT(state->frames)
    return 0;
}



fus_state_frame_t *fus_state_get_cur_frame(fus_state_t *state){
    if(state->frames_len == 0)return NULL;
    return &state->frames[state->frames_len - 1];
}

int fus_state_step(fus_state_t *state){
    int err;
    fus_state_frame_t *frame = fus_state_get_cur_frame(state);
    if(frame == NULL){
        ERR_INFO();
        fprintf(stderr, "No current frame\n");
        return 2;
    }
    fus_coderef_t *coderef = &frame->coderef;
    fus_code_t *code = coderef->code;
    fus_opcode_t opcode = code->opcodes[coderef->opcode_i];
    coderef->opcode_i++;
    switch(opcode){
    case FUS_SYMCODE_LITERAL: {
        int literal_i = -1;
        err = fus_code_get_int(code, coderef->opcode_i, &literal_i);
        if(err)return err;
        coderef->opcode_i += FUS_CODE_OPCODES_PER_INT;
        FUS_STACK_PUSH(state->stack, code->literals[literal_i])
        break;}
    case FUS_SYMCODE_TYPEOF: {
        int sym_i = -1;
        fus_type_t type = state->stack.tos.type;
        if(type == FUS_TYPE_NULL){
            sym_i = FUS_SYMCODE_NULL;
        }else if(type == FUS_TYPE_BOOL){
            sym_i = FUS_SYMCODE_BOOL;
        }else if(type == FUS_TYPE_INT || type == FUS_TYPE_BIGINT){
            sym_i = FUS_SYMCODE_INT;
        }else if(type == FUS_TYPE_STR){
            sym_i = FUS_SYMCODE_STR;
        }else if(type == FUS_TYPE_SYM){
            sym_i = FUS_SYMCODE_SYM;
        }else if(type == FUS_TYPE_ARR){
            sym_i = FUS_SYMCODE_ARR;
        }else if(type == FUS_TYPE_OBJ){
            sym_i = FUS_SYMCODE_OBJ;
        }else if(type == FUS_TYPE_FUN){
            sym_i = FUS_SYMCODE_FUN;
        }else{
            ERR_INFO();
            fprintf(stderr, "Unrecognized type: %i\n", type);
            return 2;
        }
        fus_value_detach(state->stack.tos);
        state->stack.tos = fus_value_sym(sym_i);
        break;}
    case FUS_SYMCODE_STACK_DUP: {
        /* x -> x x */
        FUS_STACK_PUSH(state->stack, state->stack.tos)
        break;}
    case FUS_SYMCODE_STACK_DROP: {
        /* x -> */
        fus_value_t popped_value;
        FUS_STACK_POP(state->stack, popped_value)
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_STACK_SWAP: {
        /* x y -> y x */
        fus_value_t temp_value = state->stack.tos;
        state->stack.tos = state->stack.nos;
        state->stack.nos = temp_value;
        break;}
    case FUS_SYMCODE_STACK_NIP: {
        /* x y -> y */
        fus_value_t popped_value;
        FUS_STACK_POP(state->stack, popped_value)
        fus_value_detach(state->stack.tos);
        state->stack.tos = popped_value;
        break;}
    case FUS_SYMCODE_STACK_OVER: {
        /* x y -> x y x */
        break;}
    case FUS_SYMCODE_DEBUG_PRINT: {
        fus_value_t popped_value;
        FUS_STACK_POP(state->stack, popped_value)
        fus_value_print(popped_value, state->compiler->symtable,
            stdout, 0, 0);
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_INT_LITERAL: {
        int i = -1;
        err = fus_code_get_int(code, coderef->opcode_i, &i);
        if(err)return err;
        coderef->opcode_i += FUS_CODE_OPCODES_PER_INT;
        FUS_STACK_PUSH(state->stack, fus_value_int(i))
        break;}
    case FUS_SYMCODE_INT_ADD: {
        if(!(
            state->stack.nos.type == FUS_TYPE_INT &&
            state->stack.tos.type == FUS_TYPE_INT
        )){
            ERR_INFO();
            fus_sym_t *opcode_sym = fus_symtable_get(
                state->compiler->symtable, opcode);
            fprintf(stderr, "Executing opcode %s: "
                "Expected (i i) on stack, found (%c %c)\n",
                fus_symtable_get_token(state->compiler->symtable, opcode),
                fus_type_to_c(state->stack.nos.type),
                fus_type_to_c(state->stack.tos.type));
            return 2;
        }
        fus_value_t popped_value;
        FUS_STACK_POP(state->stack, popped_value)
        state->stack.tos.data.i += popped_value.data.i;
        fus_value_detach(popped_value);
        break;}
    default: {
        ERR_INFO();
        fprintf(stderr, "Unrecognized opcode: %i\n", opcode);
        return 2;}
    }
    return 0;
}

