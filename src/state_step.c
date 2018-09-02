
#include "includes.h"


static int _fus_state_step(fus_state_t *state, fus_state_frame_t *frame){
    int err;

    fus_coderef_t *coderef = &frame->coderef;
    fus_code_t *code = coderef->code;
    fus_opcode_t opcode = code->opcodes[coderef->opcode_i];
    fus_stack_t *stack = &state->stack;

    frame->last_executed_opcode_i = coderef->opcode_i;

#ifdef FUS_STATE_DEBUG
    printf("STATE STEP INNER: OPCODE %i: %i (",
        coderef->opcode_i, opcode);
    fus_code_print_opcode_at(code, coderef->opcode_i,
        state->compiler->symtable, stdout);
    printf(")\n");
#endif

    #define FUS_STATE_ASSERT_STACK(T) if(!( \
        (T == FUS_TYPE_ANY || stack->tos.type == T) \
    )){ \
        ERR_INFO(); \
        fus_sym_t *opcode_sym = fus_symtable_get( \
            state->compiler->symtable, opcode); \
        fprintf(stderr, "Expected (%c) on stack, found (%c)\n", \
            fus_type_to_c(T), fus_type_to_c(stack->tos.type)); \
        return 2; \
    }

    #define FUS_STATE_ASSERT_STACK2(T1, T2) if(!( \
        (T1 == FUS_TYPE_ANY || stack->nos.type == T1) && \
        (T2 == FUS_TYPE_ANY || stack->tos.type == T2) \
    )){ \
        ERR_INFO(); \
        fus_sym_t *opcode_sym = fus_symtable_get( \
            state->compiler->symtable, opcode); \
        fprintf(stderr, "Expected (%c %c) on stack, found (%c %c)\n", \
            fus_type_to_c(T1), fus_type_to_c(T2), \
            fus_type_to_c(stack->nos.type), \
            fus_type_to_c(stack->tos.type)); \
        return 2; \
    }

    #define FUS_STATE_CODE_GET_INT(i) { \
        (i) = fus_code_get_int(code, coderef->opcode_i); \
        coderef->opcode_i += FUS_CODE_OPCODES_PER_INT; \
    }

    #define FUS_STATE_CODE_GET_SYM(sym_i) { \
        FUS_STATE_CODE_GET_INT(sym_i) \
        if(sym_i < 0){ \
            ERR_INFO(); \
            fprintf(stderr, "Sym not found: %s\n", \
                fus_symtable_get_token(state->compiler->symtable, sym_i)); \
            return 2; \
        } \
    }

    #define FUS_STATE_GET_SYM(_dynamic) \
    int sym_i = -1; \
    { \
        bool dynamic = (_dynamic); \
        if(dynamic){ \
            FUS_STATE_ASSERT_STACK(FUS_TYPE_SYM) \
            fus_value_t popped_value; \
            FUS_STACK_POP(*stack, popped_value) \
            sym_i = popped_value.data.i; \
        }else{ \
            FUS_STATE_CODE_GET_SYM(sym_i) \
        } \
    }

    coderef->opcode_i++;
    switch(opcode){
    case FUS_SYMCODE_CALL: {
        int def_i = -1;
        FUS_STATE_CODE_GET_INT(def_i)
        fus_compiler_frame_t *frame = NULL;
        err = fus_compiler_get_frame(state->compiler, def_i, true,
            &frame);
        if(err)return err;
        err = fus_state_push_frame(state, &frame->data.def.code);
        if(err)return err;
        break;}
    case FUS_SYMCODE_LITERAL: {
        int literal_i = -1;
        FUS_STATE_CODE_GET_INT(literal_i)
        FUS_STACK_PUSH(*stack, code->literals[literal_i])
        break;}
    case FUS_SYMCODE_TYPES_IS: {
        int sym_i = -1;
        FUS_STATE_CODE_GET_SYM(sym_i)
        fus_type_t type = stack->tos.type;
        fus_value_detach(stack->tos);
        stack->tos = fus_value_bool(
            sym_i == fus_type_get_sym_i(type));
        break;}
    case FUS_SYMCODE_TYPES_TYPEOF: {
        fus_type_t type = stack->tos.type;
        int sym_i = fus_type_get_sym_i(type);
        fus_value_detach(stack->tos);
        stack->tos = fus_value_sym(sym_i);
        break;}
    case FUS_SYMCODE_STACK_DUP: {
        /* x -> x x */
        FUS_STACK_PUSH(*stack, stack->tos)
        break;}
    case FUS_SYMCODE_STACK_DROP: {
        /* x -> */
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_STACK_SWAP: {
        /* x y -> y x */
        fus_value_t temp_value = stack->tos;
        stack->tos = stack->nos;
        stack->nos = temp_value;
        break;}
    case FUS_SYMCODE_STACK_NIP: {
        /* x y -> y */
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        fus_value_detach(stack->tos);
        stack->tos = popped_value;
        break;}
    case FUS_SYMCODE_STACK_OVER: {
        /* x y -> x y x */
        FUS_STACK_PUSH(*stack, stack->nos)
        break;}
    case FUS_SYMCODE_VAR_GET: case FUS_SYMCODE_VAR_RIP: {
        int sym_i = -1;
        FUS_STATE_CODE_GET_SYM(sym_i)
        fus_obj_entry_t *entry = fus_obj_get(&frame->vars, sym_i);
        if(entry == NULL){
            ERR_INFO();
            fprintf(stderr, "Var not found: %s\n",
                fus_symtable_get_token(state->compiler->symtable, sym_i));
            return 2;
        }
        FUS_STACK_PUSH(*stack, entry->value)
        if(opcode == FUS_SYMCODE_VAR_RIP){
            entry->value = fus_value_null();
        }
        break;}
    case FUS_SYMCODE_VAR_SET: {
        int sym_i = -1;
        FUS_STATE_CODE_GET_SYM(sym_i)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        err = fus_obj_set(&frame->vars, sym_i, popped_value);
        if(err)return err;
        break;}
    case FUS_SYMCODE_CONTROL_JUMP: {
        int i = 0;
        FUS_STATE_CODE_GET_INT(i)
        coderef->opcode_i = i;
        break;}
    case FUS_SYMCODE_CONTROL_JUMPIF: case FUS_SYMCODE_CONTROL_JUMPIFNOT: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_BOOL)
        int i = 0;
        FUS_STATE_CODE_GET_INT(i)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        bool b = opcode == FUS_SYMCODE_CONTROL_JUMPIF?
            popped_value.data.b: !popped_value.data.b;
        if(b)coderef->opcode_i = i;
        break;}
    case FUS_SYMCODE_DEBUG_PRINT: {
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        fus_value_print(popped_value, state->compiler->symtable,
            stdout, 0, 0);
        printf("\n");
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_DEBUG_STACK: {
        fus_arr_t *a = malloc(sizeof(a));
        if(a == NULL)return 1;
        err = fus_arr_copy_stack(a, stack);
        if(err)return err;
        FUS_STACK_PUSH(*stack, fus_value_arr(a))
        break;}
    case FUS_SYMCODE_DEBUG_VARS: {
        fus_obj_t *o = malloc(sizeof(o));
        if(o == NULL)return 1;
        err = fus_obj_copy(o, &frame->vars);
        if(err)return err;
        FUS_STACK_PUSH(*stack, fus_value_obj(o))
        break;}
    case FUS_SYMCODE_DEBUG_ASSERT: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_BOOL)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        if(!popped_value.data.b){
            ERR_INFO();
            fprintf(stderr, "Failed assertion\n");
            return 2;
        }
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_DEBUG_ERROR: {
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        ERR_INFO();
        fprintf(stderr, "Error raised: ");
        fus_value_print(popped_value, state->compiler->symtable,
            stderr, 0, 0);
        fprintf(stderr, "\n");
        fus_value_detach(popped_value);
        return 2;
        break;}
    case FUS_SYMCODE_NULL: {
        FUS_STACK_PUSH(*stack, fus_value_null())
        break;}
    case FUS_SYMCODE_BOOL_Y: {
        FUS_STACK_PUSH(*stack, fus_value_bool(true))
        break;}
    case FUS_SYMCODE_BOOL_N: {
        FUS_STACK_PUSH(*stack, fus_value_bool(false))
        break;}
    case FUS_SYMCODE_BOOL_NOT: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_BOOL)
        stack->tos.data.b = !stack->tos.data.b;
        break;}
    case FUS_SYMCODE_BOOL_AND: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_BOOL, FUS_TYPE_BOOL)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.b = stack->tos.data.b && popped_value.data.b;
        break;}
    case FUS_SYMCODE_BOOL_OR: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_BOOL, FUS_TYPE_BOOL)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.b = stack->tos.data.b || popped_value.data.b;
        break;}
    case FUS_SYMCODE_BOOL_EQ: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_BOOL, FUS_TYPE_BOOL)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.b = stack->tos.data.b == popped_value.data.b;
        break;}
    case FUS_SYMCODE_INT_LITERAL: {
        int i = -1;
        FUS_STATE_CODE_GET_INT(i)
        FUS_STACK_PUSH(*stack, fus_value_int(i))
        break;}
    case FUS_SYMCODE_INT_NEG: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_INT)
        stack->tos.data.i = -stack->tos.data.i;
        break;}
    case FUS_SYMCODE_INT_ADD: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.i += popped_value.data.i;
        break;}
    case FUS_SYMCODE_INT_SUB: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.i -= popped_value.data.i;
        break;}
    case FUS_SYMCODE_INT_MUL: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.i *= popped_value.data.i;
        break;}
    case FUS_SYMCODE_INT_DIV: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.i /= popped_value.data.i;
        break;}
    case FUS_SYMCODE_INT_MOD: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos.data.i %= popped_value.data.i;
        break;}
    case FUS_SYMCODE_INT_LT: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(
            stack->tos.data.i < popped_value.data.i);
        break;}
    case FUS_SYMCODE_INT_GT: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(
            stack->tos.data.i > popped_value.data.i);
        break;}
    case FUS_SYMCODE_INT_LE: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(
            stack->tos.data.i <= popped_value.data.i);
        break;}
    case FUS_SYMCODE_INT_GE: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(
            stack->tos.data.i >= popped_value.data.i);
        break;}
    case FUS_SYMCODE_INT_EQ: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(
            stack->tos.data.i == popped_value.data.i);
        break;}
    case FUS_SYMCODE_INT_NE: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_INT, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(
            stack->tos.data.i != popped_value.data.i);
        break;}
    case FUS_SYMCODE_INT_TOSTR: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_INT)
        int i = stack->tos.data.i;
        char *text = strcpy_int(i);
        if(text == NULL)return 1;
        fus_str_t *s = fus_str(text);
        if(s == NULL)return 1;
        FUS_STACK_SET_TOS(*stack, fus_value_str(s))
        break;}
    case FUS_SYMCODE_STR_LEN: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_STR)
        int len = fus_str_len(stack->tos.data.s);
        fus_value_detach(stack->tos);
        stack->tos = fus_value_int(len);
        break;}
    case FUS_SYMCODE_STR_EQ: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_STR, FUS_TYPE_STR)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(fus_str_eq(
            stack->tos.data.s, popped_value.data.s));
        break;}
    case FUS_SYMCODE_STR_JOIN: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_STR, FUS_TYPE_STR)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        fus_str_t *s2 = popped_value.data.s;
        fus_str_t *s = stack->tos.data.s;
        int s_len = fus_str_len(s);
        int s2_len = fus_str_len(s2);
        int new_text_len = s_len + s2_len;
        char *new_text = malloc(sizeof(*new_text) * (new_text_len + 1));
        if(new_text == NULL)return 1;
        new_text[new_text_len] = '\0';
        strncpy(new_text, s->text, s->text_len);
        strncpy(new_text + s->text_len, s2->text, s2->text_len);
        fus_str_t *new_s = fus_str(new_text);
        if(new_s == NULL)return 1;
        fus_value_detach(stack->tos);
        stack->tos = fus_value_str(new_s);
        fus_value_attach(stack->tos);
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_SYM_EQ: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_SYM, FUS_TYPE_SYM)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        stack->tos = fus_value_bool(
            stack->tos.data.i == popped_value.data.i);
        break;}
    case FUS_SYMCODE_SYM_TOSTR: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_SYM)
        const char *token = fus_symtable_get_token(
            state->compiler->symtable, stack->tos.data.i);
        fus_str_t *s = fus_str(strdup(token));
        if(s == NULL)return 1;
        FUS_STACK_SET_TOS(*stack, fus_value_str(s))
        break;}
    case FUS_SYMCODE_OBJ: {
        FUS_STACK_PUSH(*stack, fus_value_obj(NULL))
        break;}
    case FUS_SYMCODE_OBJ_GET: case FUS_SYMCODE_OBJ_RIP:
    case FUS_SYMCODE_OBJ_DYNAMIC_GET: case FUS_SYMCODE_OBJ_DYNAMIC_RIP: {
        FUS_STATE_GET_SYM(opcode == FUS_SYMCODE_OBJ_DYNAMIC_GET
            || opcode == FUS_SYMCODE_OBJ_DYNAMIC_RIP)
        FUS_STATE_ASSERT_STACK(FUS_TYPE_OBJ)
        bool is_rip = opcode == FUS_SYMCODE_OBJ_RIP
            || opcode == FUS_SYMCODE_OBJ_DYNAMIC_RIP;
        if(is_rip){FUS_VALUE_MKUNIQUE(obj, stack->tos.data.o)}
        fus_obj_t *o = stack->tos.data.o;
        fus_obj_entry_t *entry = fus_obj_get(o, sym_i);
        if(entry == NULL){
            ERR_INFO();
            fprintf(stderr, "Obj key not found: %s\n",
                fus_symtable_get_token(state->compiler->symtable, sym_i));
            return 2;
        }
        if(is_rip){
            FUS_STACK_PUSH(*stack, entry->value)
            entry->value = fus_value_null();
        }else{
            fus_value_t value = entry->value;
            fus_value_attach(value);
            fus_value_detach(stack->tos);
            stack->tos = value;
        }
        break;}
    case FUS_SYMCODE_OBJ_SET: case FUS_SYMCODE_OBJ_DYNAMIC_SET: {
        FUS_STATE_GET_SYM(opcode == FUS_SYMCODE_OBJ_DYNAMIC_SET)
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_OBJ, FUS_TYPE_ANY)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        FUS_VALUE_MKUNIQUE(obj, stack->tos.data.o)
        err = fus_obj_set(stack->tos.data.o, sym_i, popped_value);
        if(err)return err;
        break;}
    case FUS_SYMCODE_OBJ_HAS: case FUS_SYMCODE_OBJ_DYNAMIC_HAS: {
        FUS_STATE_GET_SYM(opcode == FUS_SYMCODE_OBJ_DYNAMIC_HAS)
        FUS_STATE_ASSERT_STACK(FUS_TYPE_OBJ)
        fus_obj_t *o = stack->tos.data.o;
        fus_obj_entry_t *entry = fus_obj_get(o, sym_i);
        bool b = entry != NULL;
        fus_value_detach(stack->tos);
        stack->tos = fus_value_bool(b);
        break;}
    case FUS_SYMCODE_OBJ_KEYS: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_OBJ)
        fus_arr_t *a = NULL;
        err = fus_obj_keys(stack->tos.data.o, &a);
        if(err)return err;
        fus_value_detach(stack->tos);
        stack->tos = fus_value_arr(a);
        fus_value_attach(stack->tos);
        break;}
    case FUS_SYMCODE_ARR: {
        FUS_STACK_PUSH(*stack, fus_value_arr(NULL))
        break;}
    case FUS_SYMCODE_ARR_LEN: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_ARR)
        int len = fus_arr_len(stack->tos.data.a);
        fus_value_detach(stack->tos);
        stack->tos = fus_value_int(len);
        break;}
    case FUS_SYMCODE_ARR_PUSH:
    case FUS_SYMCODE_ARR_PUSH_ALT:
    case FUS_SYMCODE_ARR_LPUSH: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_ARR, FUS_TYPE_ANY)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        FUS_VALUE_MKUNIQUE(arr, stack->tos.data.a)
        if(stack->tos.data.a == NULL){
            fus_arr_t *a = malloc(sizeof(*a));
            if(a == NULL)return 1;
            err = fus_arr_init(a);
            if(err)return err;
            a->refcount++;
            stack->tos.data.a = a;
        }
        if(opcode == FUS_SYMCODE_ARR_LPUSH){
            err = fus_arr_push_l(stack->tos.data.a, popped_value);
            if(err)return err;
        }else{
            err = fus_arr_push(stack->tos.data.a, popped_value);
            if(err)return err;
        }
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_ARR_POP: case FUS_SYMCODE_ARR_LPOP: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_ARR)
        FUS_VALUE_MKUNIQUE(arr, stack->tos.data.a)
        fus_arr_t *a = stack->tos.data.a;
        fus_value_t value;
        if(opcode == FUS_SYMCODE_ARR_LPOP){
            err = fus_arr_pop_l(a, &value);
            if(err)return err;
        }else{
            err = fus_arr_pop(a, &value);
            if(err)return err;
        }
        FUS_STACK_PUSH(*stack, value)
        break;}
    case FUS_SYMCODE_ARR_GET:
    case FUS_SYMCODE_ARR_RIP:
    case FUS_SYMCODE_ARR_HAS: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_ARR, FUS_TYPE_INT)
        int i = stack->tos.data.i;
        bool is_rip = opcode == FUS_SYMCODE_ARR_RIP;
        bool is_get = opcode == FUS_SYMCODE_ARR_GET;
        if(is_rip){FUS_VALUE_MKUNIQUE(arr, stack->nos.data.a)}
        fus_arr_t *a = stack->nos.data.a;
        fus_value_t value;
        if(is_rip){
            err = fus_arr_rip(a, i, &value);
            if(err)return err;
        }else if(is_get){
            err = fus_arr_get(a, i, &value);
            if(err)return err;
            fus_value_t popped_value;
            FUS_STACK_POP(*stack, popped_value)
        }else{
            bool has = i >= 0 && a != NULL && i < a->values_len;
            value = fus_value_bool(has);
        }
        fus_value_detach(stack->tos);
        stack->tos = value;
        fus_value_attach(value);
        break;}
    case FUS_SYMCODE_ARR_SET: {
        FUS_STATE_ASSERT_STACK(FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        int i = popped_value.data.i;
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_ARR, FUS_TYPE_ANY)
        FUS_STACK_POP(*stack, popped_value)
        FUS_VALUE_MKUNIQUE(arr, stack->tos.data.a)
        fus_arr_t *a = stack->tos.data.a;
        err = fus_arr_set(a, i, popped_value);
        if(err)return err;
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_ARR_SPLIT: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_ARR, FUS_TYPE_INT)
        int i = stack->tos.data.i;
        int len = fus_arr_len(stack->nos.data.a);
        if(i < 0 || i > len){
            ERR_INFO();
            fprintf(stderr, "Can't split array with length %i at index %i\n",
                len, i);
            return 2;
        }
        FUS_VALUE_MKUNIQUE(arr, stack->nos.data.a)
        fus_arr_t *a = stack->nos.data.a;
        fus_arr_t *a2 = malloc(sizeof(*a2));
        if(a2 == NULL)return 1;
        err = fus_arr_init(a2);
        if(err)return err;
        fus_value_detach(stack->tos);
        stack->tos = fus_value_arr(a2);
        fus_value_attach(stack->tos);
        for(int j = len - 1; j >= i; j--){
            fus_value_t value;
            err = fus_arr_pop(a, &value);
            if(err)return err;
            err = fus_arr_push_l(a2, value);
            if(err)return err;
        }
        break;}
    case FUS_SYMCODE_ARR_JOIN: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_ARR, FUS_TYPE_ARR)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        fus_arr_t *a2 = popped_value.data.a;
        FUS_VALUE_MKUNIQUE(arr, stack->tos.data.a)
        fus_arr_t *a = stack->tos.data.a;
        int a2_len = fus_arr_len(a2);
        for(int i = 0; i < a2_len; i++){
            err = fus_arr_push(a, a2->values[i]);
            if(err)return err;
        }
        fus_value_detach(popped_value);
        break;}
    case FUS_SYMCODE_ARR_REPEAT: {
        FUS_STATE_ASSERT_STACK2(FUS_TYPE_ANY, FUS_TYPE_INT)
        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        int n = popped_value.data.i;
        fus_value_t value = stack->tos;
        fus_arr_t *a = malloc(sizeof(*a));
        if(a == NULL)return 1;
        err = fus_arr_init(a);
        if(err)return err;
        for(int i = 0; i < n; i++){
            err = fus_arr_push(a, value);
            if(err)return err;
        }
        fus_value_detach(value);
        stack->tos = fus_value_arr(a);
        fus_value_detach(stack->tos);
        break;}
    case FUS_SYMCODE_FUN_LITERAL: {
        int frame_i = -1;
        FUS_STATE_CODE_GET_INT(frame_i)
        fus_compiler_frame_t *frame = NULL;
        err = fus_compiler_get_frame(state->compiler, frame_i, true,
            &frame);
        if(err)return err;
        FUS_STACK_PUSH(*stack, fus_value_fun(&frame->data.def.code))
        break;}
    case FUS_SYMCODE_FUN_CALL: {
        int sig_frame_i = -1;
        FUS_STATE_CODE_GET_INT(sig_frame_i)
        FUS_STATE_ASSERT_STACK(FUS_TYPE_FUN)

        fus_compiler_frame_t *sig_frame = NULL;
        err = fus_compiler_get_frame(state->compiler,
            sig_frame_i, true, &sig_frame);
        if(err)return err;
        /* TODO: Check that signature of sig_frame matches that
        of popped_value.data.f
        ...although that's not even possible now that we removed
        code->sig.
        So we're going to have to think about what values are actually
        stored in code->opcodes.
        (Raw fus_compiler_frame_t pointers?..) */

        fus_value_t popped_value;
        FUS_STACK_POP(*stack, popped_value)
        err = fus_state_push_frame(state, popped_value.data.f);
        if(err)return err;
        break;}
    default: {
        fus_sym_t *opcode_sym = fus_symtable_get(
            state->compiler->symtable, opcode);
        ERR_INFO();
        fprintf(stderr, "Bad opcode %i (%s): ", opcode,
            fus_symtable_get_token(state->compiler->symtable, opcode));
        if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_NOT_OPCODE){
            fprintf(stderr, "Not an opcode\n");
        }else{
            fprintf(stderr, "Not yet implemented\n");
        }
        return 2;}
    }
    return 0;
}




int fus_state_step(fus_state_t *state, bool *done_ptr){
start: ;
    int err;

    /* Get currently executing frame, or if none, report done execution */
    fus_state_frame_t *frame = fus_state_get_cur_frame(state);
    if(frame == NULL){
        *done_ptr = true;
        return 0;
    }

    /* If at end of frame's code, pop it & start over */
    fus_coderef_t *coderef = &frame->coderef;
    fus_code_t *code = coderef->code;
    if(coderef->opcode_i >= code->opcodes_len){
        err = fus_state_pop_frame(state);
        if(err)return err;
        goto start;
    }

    /* Do the stuff */
    err = _fus_state_step(state, frame);

    /* Show debug info if there was an error */
    if(err){
        for(int i = state->frames_len - 1; i >= 0; i--){
            fus_state_frame_t *frame = state->frames[i];
            fus_coderef_t *coderef = &frame->coderef;
            fus_code_t *code = coderef->code;
            int opcode_i = frame->last_executed_opcode_i;
            fus_opcode_t opcode = code->opcodes[opcode_i];

            fprintf(stderr, "  Executing opcode %s at byte %i\n",
                fus_symtable_get_token(state->compiler->symtable, opcode),
                opcode_i);
            fus_compiler_frame_debug_info(code->compiler_frame,
                stderr, 4);
        }
    }

    return err;
}

