

#include "includes.h"



int fus_runner_step(fus_runner_t *runner){

    /* Get some variables from callframe */
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    if(callframe == NULL){
        fprintf(stderr, "%s: Stepping a done runner is an error!\n",
            __func__);
        goto err;
    }
    fus_arr_t *data = callframe->data;
    int i = callframe->i;
    fus_value_t *token_values = FUS_ARR_VALUES(*data);
    int token_values_len = data->values.len;
    if(i >= token_values_len){
        /* End callframe if we've reached end of data.
        Doing so counts as a complete step. */
        fus_runner_end_callframe(runner, false);
        return 0;
    }
    fus_value_t token_value = token_values[i];

    /* Get some variables from vm */
    fus_vm_t *vm = runner->vm;
    fus_symtable_t *symtable = vm->symtable;

    /* Get stack, vars */
    fus_arr_t *stack = fus_runner_get_stack(runner);
    fus_obj_t *vars = fus_runner_get_vars(runner);

    {

        #define FUS_STATE_NEXT_VALUE() \
            i++; \
            if(i >= token_values_len){ \
                fprintf(stderr, "%s: Missing token after %s\n", \
                    __func__, token); \
                goto err; \
            } \
            token_value = token_values[i];

        #define FUS_STATE_PEEK_NEXT_VALUE(VALUE) \
            if(i + 1 >= token_values_len){ \
                (VALUE) = fus_value_null(vm); \
            }else{ \
                (VALUE) = token_values[i + 1]; \
            }

        #define FUS_STATE_ASSERT_T(VALUE, T) { \
            fus_value_t __value = (VALUE); \
            if(!fus_value_is_##T(__value)){ \
                fprintf(stderr, "%s: Expected " #T ", got: %s\n", \
                    __func__, fus_value_type_msg(__value)); \
                goto err; \
            } \
        }

        #define FUS_STATE_EXPECT_T(T) FUS_STATE_ASSERT_T(token_value, T)

        #define FUS_STATE_EXPECT_SYM(TOKEN) \
            FUS_STATE_EXPECT_T(SYM) \
            { \
                int __sym_i = fus_value_sym_decode(vm, token_value); \
                const char *__token = fus_symtable_get_token(symtable, sym_i); \
                const char *__token_expected = (TOKEN); \
                if(strcmp(__token, __token_expected)){ \
                    fprintf(stderr, "%s: Expected \"%s\" after %s, " \
                        "but got: %s\n", \
                        __func__, __token_expected, token, __token); \
                    goto err; \
                } \
            }

        #define FUS_STATE_STACK_POP(VPTR) \
            if(fus_arr_pop(vm, stack, (VPTR)))goto err;

        #define FUS_STATE_STACK_PUSH(VALUE) \
            fus_arr_push(vm, stack, (VALUE));

        #define FUS_RUNNER_SUPER_HACKY_TABS() { \
            printf(":D"); \
            int callframes_len = runner->callframes.len; \
            for(int i = 0; i < callframes_len; i++)printf("  "); \
        }

        #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
        if(!fus_value_is_sym(token_value)){
            FUS_RUNNER_SUPER_HACKY_TABS()
            printf("%s\n", fus_value_type_msg(token_value));
        }
        #endif

        if(fus_value_is_int(token_value) || fus_value_is_str(token_value)){
            fus_value_attach(vm, token_value);
            FUS_STATE_STACK_PUSH(token_value)
        }else if(fus_value_is_sym(token_value)){
            int sym_i = fus_value_sym_decode(vm, token_value);
            const char *token = fus_symtable_get_token(symtable, sym_i);

            #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
            FUS_RUNNER_SUPER_HACKY_TABS()
            printf("%s\n", token);
            #endif

            if(sym_i < 0 || sym_i >= FUS_KEYWORDS){
                fprintf(stderr, "%s: Builtin not found: %s\n",
                    __func__, token);
                goto err;
            }

            int n_args_in;
            int n_args_out;
            int n_args_inline;
            fus_keyword_t *keyword = &vm->keywords[sym_i];
            if(keyword->parse_args(keyword, data, i + 1,
                &n_args_in, &n_args_out, &n_args_inline) < 0)return -1;

            fus_value_t *values_inline = &token_values[i + 1];
            i += n_args_inline;

            switch(sym_i){
            default: {
                fprintf(stderr, "%s: Builtin not implemented: %s\n",
                    __func__, token);
                goto err;
            break;} case FUS_KEYWORD_typehint: {
                fus_value_t value_type = values_inline[0];
                int type_sym_i = fus_value_sym_decode(vm, value_type);
                fus_value_t value = fus_arr_get_last(vm, stack);
                int sym_i = fus_value_type_sym_i(vm, value);
                if(type_sym_i != sym_i){
                    const char *type_token = fus_symtable_get_token_safe(
                        vm->symtable, type_sym_i);
                    const char *token = fus_symtable_get_token_safe(
                        vm->symtable, sym_i);
                    fprintf(stderr, "%s: Failed type hint: %s is not %s\n",
                        __func__, token, type_token);
                    goto err;
                }
            break;} case FUS_KEYWORD_sym: {
                fus_value_t value = values_inline[0];
                FUS_STATE_STACK_PUSH(value)
                fus_value_attach(vm, value);
            break;} case FUS_KEYWORD_typeof: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                int sym_i = fus_value_type_sym_i(vm, value);
                fus_value_detach(vm, value);
                fus_value_t value_sym = fus_value_sym(vm, sym_i);
                FUS_STATE_STACK_PUSH(value_sym)
            break;} case FUS_KEYWORD_null: {
                fus_value_t value = fus_value_null(vm);
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_T: {
                fus_value_t value = fus_value_bool(vm, true);
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_F: {
                fus_value_t value = fus_value_bool(vm, false);
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_not: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_bool_not(vm, value);
                FUS_STATE_STACK_PUSH(new_value)
            break;} case FUS_KEYWORD_neg: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_int_neg(vm, value);
                FUS_STATE_STACK_PUSH(new_value)
            break;} case FUS_KEYWORD_int_tostr: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_int_tostr(vm, value);
                FUS_STATE_STACK_PUSH(new_value)
            break;} case FUS_KEYWORD_sym_tostr: {
                fus_value_t value_sym;
                FUS_STATE_STACK_POP(&value_sym)
                int sym_i = fus_value_sym_decode(vm, value_sym);
                const char *text = fus_symtable_get_token(vm->symtable,
                    sym_i);
                fus_value_t value_s = fus_value_str_from_text(vm, text);
                FUS_STATE_STACK_PUSH(value_s)
                fus_value_detach(vm, value_sym);

            #define FUS_RUNNER_INT_BINOP(OP) \
            break;} case FUS_KEYWORD_int_##OP: { \
                fus_value_t value1; \
                fus_value_t value2; \
                FUS_STATE_STACK_POP(&value2) \
                FUS_STATE_STACK_POP(&value1) \
                fus_value_t value3 = fus_value_int_##OP(vm, \
                    value1, value2); \
                FUS_STATE_STACK_PUSH(value3)

            FUS_RUNNER_INT_BINOP(add)
            FUS_RUNNER_INT_BINOP(sub)
            FUS_RUNNER_INT_BINOP(mul)
            FUS_RUNNER_INT_BINOP(div)
            FUS_RUNNER_INT_BINOP(mod)
            FUS_RUNNER_INT_BINOP(eq)
            FUS_RUNNER_INT_BINOP(ne)
            FUS_RUNNER_INT_BINOP(lt)
            FUS_RUNNER_INT_BINOP(gt)
            FUS_RUNNER_INT_BINOP(le)
            FUS_RUNNER_INT_BINOP(ge)

            #define FUS_RUNNER_IS(T) \
            break;} case FUS_KEYWORD_is_##T: { \
                fus_value_t value; \
                FUS_STATE_STACK_POP(&value) \
                fus_value_t value_is = fus_value_bool(vm, \
                    fus_value_is_##T(value)); \
                fus_value_detach(vm, value); \
                FUS_STATE_STACK_PUSH(value_is)

            FUS_RUNNER_IS(int)
            FUS_RUNNER_IS(sym)
            FUS_RUNNER_IS(null)
            FUS_RUNNER_IS(bool)
            FUS_RUNNER_IS(arr)
            FUS_RUNNER_IS(str)
            FUS_RUNNER_IS(obj)
            FUS_RUNNER_IS(fun)

            #define FUS_RUNNER_EQ(T) \
            break;} case FUS_KEYWORD_##T##eq: { \
                fus_value_t value1; \
                fus_value_t value2; \
                FUS_STATE_STACK_POP(&value2) \
                FUS_STATE_STACK_POP(&value1) \
                fus_value_t value3 = fus_value_##T##eq(vm, \
                    value1, value2); \
                fus_value_detach(vm, value1); \
                fus_value_detach(vm, value2); \
                FUS_STATE_STACK_PUSH(value3)

            FUS_RUNNER_EQ()
            //FUS_RUNNER_EQ(int_)
            FUS_RUNNER_EQ(sym_)
            FUS_RUNNER_EQ(bool_)
            //FUS_RUNNER_EQ(arr_)
            FUS_RUNNER_EQ(str_)
            //FUS_RUNNER_EQ(obj_)
            //FUS_RUNNER_EQ(fun_)

            break;} case FUS_KEYWORD_arr: {
                fus_value_t value = fus_value_arr(vm);
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_obj: {
                fus_value_t value = fus_value_obj(vm);
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_tuple: {
                fus_value_t value_a = fus_value_arr(vm);
                fus_arr_t *a = &value_a.p->data.a;
                for(int i = 0; i < n_args_in; i++){
                    fus_value_t value;
                    FUS_STATE_STACK_POP(&value)
                    fus_arr_lpush(vm, a, value);
                }
                FUS_STATE_STACK_PUSH(value_a)
            break;} case FUS_KEYWORD_push: case FUS_KEYWORD_push_alt: {
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_push(vm, &value_a, value);
                FUS_STATE_STACK_PUSH(value_a)
            break;} case FUS_KEYWORD_lpush: {
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_lpush(vm, &value_a, value);
                FUS_STATE_STACK_PUSH(value_a)
            break;} case FUS_KEYWORD_pop: {
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_pop(vm, &value_a, &value);
                FUS_STATE_STACK_PUSH(value_a)
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_lpop: {
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_lpop(vm, &value_a, &value);
                FUS_STATE_STACK_PUSH(value_a)
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_join: {
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_arr_join(vm, &value1, value2);
                FUS_STATE_STACK_PUSH(value1)
                fus_value_detach(vm, value2);
            break;} case FUS_KEYWORD_slice: {
                fus_value_t value_a;
                fus_value_t value_i;
                fus_value_t value_len;
                FUS_STATE_STACK_POP(&value_len)
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_slice(vm, &value_a, value_i, value_len);
                FUS_STATE_STACK_PUSH(value_a)
                fus_value_detach(vm, value_len);
                fus_value_detach(vm, value_i);
            break;} case FUS_KEYWORD_arr_set: {
                fus_value_t value_a;
                fus_value_t value;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_set(vm, &value_a, value_i, value);
                FUS_STATE_STACK_PUSH(value_a)
                fus_value_detach(vm, value_i);
            break;} case FUS_KEYWORD_arr_get: {
                fus_value_t value_a;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_t value = fus_value_arr_get(vm, value_a, value_i);
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
                fus_value_detach(vm, value_a);
                fus_value_detach(vm, value_i);
            break;} case FUS_KEYWORD_arr_rip: {
                fus_value_t value_a;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_a)

                /* fus_value_arr_rip ...? */
                fus_value_t value = fus_value_arr_get(vm, value_a, value_i);
                fus_value_attach(vm, value);
                fus_value_arr_set(vm, &value_a, value_i, fus_value_null(vm));

                FUS_STATE_STACK_PUSH(value_a)
                FUS_STATE_STACK_PUSH(value)
                fus_value_detach(vm, value_i);
            break;} case FUS_KEYWORD_set_inline: case FUS_KEYWORD_set: {
                int sym_i = -1;
                if(token[0] == 's'){
                    /* "set" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* "=." */
                    sym_i = fus_value_sym_decode(vm, values_inline[0]);
                }
                fus_value_t value_o;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_o)
                fus_value_obj_set(vm, &value_o, sym_i, value);
                FUS_STATE_STACK_PUSH(value_o)
            break;} case FUS_KEYWORD_get_inline: case FUS_KEYWORD_get: {
                int sym_i = -1;
                if(token[0] == 'g'){
                    /* "get" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* "." */
                    sym_i = fus_value_sym_decode(vm, values_inline[0]);
                }
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value = fus_value_obj_get(vm, value_o, sym_i);
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
                fus_value_detach(vm, value_o);
            break;} case FUS_KEYWORD_rip_inline: case FUS_KEYWORD_rip: {
                int sym_i = -1;
                if(token[0] == 'r'){
                    /* "rip" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* ".." */
                    sym_i = fus_value_sym_decode(vm, values_inline[0]);
                }
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value = fus_value_obj_get(vm, value_o, sym_i);
                fus_value_attach(vm, value);
                fus_value_obj_set(vm, &value_o, sym_i, fus_value_null(vm));
                FUS_STATE_STACK_PUSH(value_o)
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_has_inline: case FUS_KEYWORD_has: {
                int sym_i = -1;
                if(token[0] == 'h'){
                    /* "has" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* "?." */
                    sym_i = fus_value_sym_decode(vm, values_inline[0]);
                }
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value_has = fus_value_obj_has(vm, value_o, sym_i);
                FUS_STATE_STACK_PUSH(value_has)
                fus_value_detach(vm, value_o);
            break;} case FUS_KEYWORD_keys: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_ASSERT_T(value, obj)
                fus_obj_t *o = &value.p->data.o;
                int keys_len = o->keys.len;
                int *keys = FUS_ARRAY_GET_REF(o->keys, 0);

                fus_value_t value_keys = fus_value_arr(vm);
                fus_arr_t *a_keys = &value_keys.p->data.a;
                for(int i = 0; i < keys_len; i++){
                    int key = keys[i];
                    fus_value_t value_key = fus_value_sym(vm, key);
                    fus_arr_push(vm, a_keys, value_key);
                }

                FUS_STATE_STACK_PUSH(value_keys)
                fus_value_detach(vm, value);
            break;} case FUS_KEYWORD_len: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t value_len = fus_value_arr_len(vm, value);
                FUS_STATE_STACK_PUSH(value_len)
                fus_value_detach(vm, value);
            break;} case FUS_KEYWORD_str_len: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t value_len = fus_value_str_len(vm, value);
                FUS_STATE_STACK_PUSH(value_len)
                fus_value_detach(vm, value);
            break;} case FUS_KEYWORD_str_join: {
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_str_join(vm, &value1, value2);
                FUS_STATE_STACK_PUSH(value1)
                fus_value_detach(vm, value2);
            break;} case FUS_KEYWORD_str_slice: {
                fus_value_t value_s;
                fus_value_t value_i;
                fus_value_t value_len;
                FUS_STATE_STACK_POP(&value_len)
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_s)
                fus_value_str_slice(vm, &value_s, value_i, value_len);
                FUS_STATE_STACK_PUSH(value_s)
                fus_value_detach(vm, value_len);
                fus_value_detach(vm, value_i);
            break;} case FUS_KEYWORD_str_getcode: {
                fus_value_t value_s;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_s)
                fus_value_t value_code = fus_value_str_getcode(vm,
                    value_s, value_i);
                FUS_STATE_STACK_PUSH(value_code)
                fus_value_detach(vm, value_i);
                fus_value_detach(vm, value_s);
            break;} case FUS_KEYWORD_str_setcode: {
                fus_value_t value_s;
                fus_value_t value_code;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_code)
                FUS_STATE_STACK_POP(&value_s)
                fus_value_str_setcode(vm, &value_s, value_code, value_i);
                FUS_STATE_STACK_PUSH(value_s)
                fus_value_detach(vm, value_i);
                fus_value_detach(vm, value_code);
            break;} case FUS_KEYWORD_str_tosym: {
                fus_value_t value_s;
                FUS_STATE_STACK_POP(&value_s)
                const char *text = fus_value_str_decode(vm, value_s);
                int sym_i = fus_symtable_get_or_add_from_string(
                    vm->symtable, text);
                fus_value_t value_sym = fus_value_sym(vm, sym_i);
                FUS_STATE_STACK_PUSH(value_sym)
                fus_value_detach(vm, value_s);
            break;} case FUS_KEYWORD_swap: {
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                FUS_STATE_STACK_PUSH(value2)
                FUS_STATE_STACK_PUSH(value1)
            break;} case FUS_KEYWORD_dup: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_PUSH(value)
                FUS_STATE_STACK_PUSH(value)
                fus_value_attach(vm, value);
            break;} case FUS_KEYWORD_drop: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_detach(vm, value);
            break;} case FUS_KEYWORD_nip: {
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_detach(vm, value1);
                FUS_STATE_STACK_PUSH(value2)
            break;} case FUS_KEYWORD_over: {
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                FUS_STATE_STACK_PUSH(value1)
                FUS_STATE_STACK_PUSH(value2)
                FUS_STATE_STACK_PUSH(value1)
                fus_value_attach(vm, value1);
            break;} case FUS_KEYWORD_var_set: {
                int sym_i = fus_value_sym_decode(vm, values_inline[0]);
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_obj_set(vm, vars, sym_i, value);
            break;} case FUS_KEYWORD_var_get: {
                int sym_i = fus_value_sym_decode(vm, values_inline[0]);
                fus_value_t value = fus_obj_get(vm, vars, sym_i);
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_var_rip: {
                int sym_i = fus_value_sym_decode(vm, values_inline[0]);
                fus_value_t value = fus_obj_get(vm, vars, sym_i);
                fus_value_attach(vm, value);
                fus_obj_set(vm, vars, sym_i, fus_value_null(vm));
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_assert: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool b = fus_value_bool_decode(vm, value);
                if(!b){
                    fprintf(stderr, "%s: Failed assertion\n", __func__);
                    goto err;
                }
            break;} case FUS_KEYWORD_stop: {
                fprintf(stderr, "%s: Stopping\n", __func__);
                return -1;
            break;} case FUS_KEYWORD_p: case FUS_KEYWORD_p_data: case FUS_KEYWORD_error: {
                bool is_error = token[0] == 'e';
                bool is_data = token[1] == '_';
                if(is_error)fprintf(stderr, "%s: Error raised: ", __func__);
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_printer_t printer;
                fus_printer_init(&printer);
                fus_printer_set_file(&printer, stderr);
                if(is_data){
                    FUS_STATE_ASSERT_T(value, arr)
                    fus_printer_write_text(&printer, "data:");
                    printer.depth++;
                    fus_printer_write_newline(&printer);
                    fus_printer_write_data(&printer, vm, &value.p->data.a,
                        0, -1);
                    printer.depth--;
                }else fus_printer_write_value(&printer, vm, value);
                fus_printer_write_newline(&printer);
                fus_printer_flush(&printer);
                fus_printer_cleanup(&printer);
                fus_value_detach(vm, value);
                if(is_error)goto err;
            break;} case FUS_KEYWORD_str_p: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_ASSERT_T(value, str)
                fus_str_t *s = &value.p->data.s;
                fus_printer_t printer;
                fus_printer_init(&printer);
                fus_printer_set_file(&printer, stderr);
                fus_printer_write(&printer, s->text, s->len);
                fus_printer_flush(&printer);
                fus_printer_cleanup(&printer);
                fus_value_detach(vm, value);
            break;} case FUS_KEYWORD_def: case FUS_KEYWORD_module:
            case FUS_KEYWORD_load: case FUS_KEYWORD_from: {
                /* These are all handled at "compile"-time.
                See: fus_runner_exec_defs */
            break;} case FUS_KEYWORD_fun: {

                /* Check for "of" */
                int sym_i = fus_value_sym_decode(vm, values_inline[0]);
                int sym_i_of = fus_symtable_get_or_add_from_string(
                    symtable, "of");
                if(sym_i != sym_i_of){
                    const char *token_of =
                        fus_symtable_get_token(symtable, sym_i);
                    fprintf(stderr, "%s: Unexpected sym after %s: %s\n",
                        __func__, token, token_of);
                    return -1;
                }

                /* Get function signature & data */
                fus_arr_t *sig = fus_value_arr_decode(vm, values_inline[1]);
                fus_arr_t *data = fus_value_arr_decode(vm, values_inline[2]);

                /* Create a function value & push to stack */
                fus_value_t value_fun = fus_value_fun(vm, NULL, data, sig);
                FUS_STATE_STACK_PUSH(value_fun)
            break;} case FUS_KEYWORD_fun_quote: {
                int sym_i = fus_value_sym_decode(vm, values_inline[0]);
                const char *token_def =
                    fus_symtable_get_token(symtable, sym_i);
                fus_value_t value_fun = fus_obj_get(vm, &runner->defs, sym_i);
                FUS_STATE_STACK_PUSH(value_fun)
                fus_value_attach(vm, value_fun);
            break;} case FUS_KEYWORD_call_inline: {
                int sym_i = fus_value_sym_decode(vm, values_inline[0]);

                #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
                const char *token_def =
                    fus_symtable_get_token(symtable, sym_i);
                FUS_RUNNER_SUPER_HACKY_TABS()
                printf("%s\n", token_def);
                #endif

                callframe->i = i + 1;
                if(fus_runner_call(runner, sym_i) < 0)return -1;
                goto dont_update_i;
            break;} case FUS_KEYWORD_call: {
                fus_arr_t *sig = fus_value_arr_decode(vm, values_inline[1]);
                /* TODO: Check stack effects */

                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_ASSERT_T(value, fun)
                fus_boxed_t *f_boxed = value.p;

                callframe->i = i + 1;
                fus_runner_push_callframe_fun(runner, FUS_CALLFRAME_TYPE_DEF,
                    f_boxed);

                goto dont_update_i;
            break;} case FUS_KEYWORD_if: case FUS_KEYWORD_ifelse:
            case FUS_KEYWORD_and: case FUS_KEYWORD_or: {
                fus_arr_t *branch1 = fus_value_arr_decode(vm,
                    values_inline[0]);
                fus_arr_t *branch2 = (sym_i == FUS_KEYWORD_ifelse)?
                    fus_value_arr_decode(vm, values_inline[1]): NULL;

                /* TODO: Check stack effects of the branches */

                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool cond = fus_value_bool_decode(vm, value);
                fus_value_detach(vm, value);

                fus_arr_t *branch_taken = NULL;
                if(sym_i == FUS_KEYWORD_and){
                    if(cond)branch_taken = branch1;
                    else FUS_STATE_STACK_PUSH(fus_value_bool(vm, cond))
                }else if(sym_i == FUS_KEYWORD_or){
                    if(!cond)branch_taken = branch1;
                    else FUS_STATE_STACK_PUSH(fus_value_bool(vm, cond))
                }else{
                    /* if, ifelse */
                    branch_taken = cond? branch1: branch2;
                }

                if(branch_taken != NULL){
                    callframe->i = i + 1;
                    fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_IF,
                        branch_taken);
                    goto dont_update_i;
                }
            break;} case FUS_KEYWORD_do: case FUS_KEYWORD_int_for:
            case FUS_KEYWORD_arr_for: {
                char c = token[0]; /* 'd' or 'i' or 'a' */
                fus_runner_callframe_type_t type =
                    c == 'd'? FUS_CALLFRAME_TYPE_DO
                    : c == 'i'? FUS_CALLFRAME_TYPE_INT_FOR
                    : FUS_CALLFRAME_TYPE_ARR_FOR;

                fus_arr_t *data = fus_value_arr_decode(vm, values_inline[0]);

                #define FUS_STATE_PUSH_CALLFRAME(DATA) \
                    callframe->i = i + 1; \
                    fus_runner_callframe_t *callframe = \
                        fus_runner_push_callframe(runner, type, (DATA));

                if(type == FUS_CALLFRAME_TYPE_INT_FOR){
                    /* int_for */
                    fus_value_t value;
                    FUS_STATE_STACK_POP(&value)
                    int n = fus_value_int_decode(vm, value);
                    fus_value_detach(vm, value);
                    if(n > 0){
                        FUS_STATE_PUSH_CALLFRAME(data)
                        callframe->loop_data.int_for.i = 0;
                        callframe->loop_data.int_for.n = n;
                        fus_runner_callframe_start(callframe);
                        goto dont_update_i;
                    }
                    fus_value_detach(vm, value);
                }else if(type == FUS_CALLFRAME_TYPE_ARR_FOR){
                    /* arr_for */
                    fus_value_t value;
                    FUS_STATE_STACK_POP(&value)
                    FUS_STATE_ASSERT_T(value, arr)
                    fus_arr_t *a = &value.p->data.a;
                    if(fus_arr_len(vm, a) > 0){
                        FUS_STATE_PUSH_CALLFRAME(data)
                        callframe->loop_data.arr_for.i = 0;
                        callframe->loop_data.arr_for.boxed = value.p;
                        fus_runner_callframe_start(callframe);
                        goto dont_update_i;
                    }
                    fus_value_detach(vm, value);
                }else{
                    /* do */
                    FUS_STATE_PUSH_CALLFRAME(data)
                    goto dont_update_i;
                }
            break;} case FUS_KEYWORD_break: case FUS_KEYWORD_loop: {
                char c = token[0] == 'b'? 'b': 'l';
                    /* 'b' for break or 'l' for loop */
                if(fus_runner_break_or_loop(runner, token, c) < 0)goto err;
                goto dont_update_i;
            break;} case FUS_KEYWORD_while: case FUS_KEYWORD_until: {
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool cond = fus_value_bool_decode(vm, value);
                fus_value_detach(vm, value);

                if(token[0] == 'w')cond = !cond; /* "while" */
                if(cond){
                    if(fus_runner_break_or_loop(runner, token, 'b') < 0)goto err;
                    goto dont_update_i;
                }
            break;} case FUS_KEYWORD_data: {
                fus_value_t value = values_inline[0];
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
            break;} case FUS_KEYWORD_ignore: {
                /* Just ignore values_inline[0]. */
            break;} case FUS_KEYWORD_dump_callframes: {
                fus_runner_dump_callframes(runner, stderr, true);
            break;} case FUS_KEYWORD_dump_state: {
                const char *dump_state = fus_value_str_decode(vm,
                    values_inline[0]);
                fus_runner_dump_state(runner, stderr, dump_state);
            }
            }
        }else if(fus_value_is_arr(token_value)){
            callframe->i = i + 1;
            fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_PAREN,
                &token_value.p->data.a);
            goto dont_update_i;
        }else{
            fprintf(stderr, "%s: Unexpected type in data to be run: %s\n",
                __func__, fus_value_type_msg(token_value));
            goto err;
        }
    }

    callframe->i = i + 1;

dont_update_i:
    /* Particularly if you push/pop a callframe, you should jump here so
    we don't attempt to access old callframe->i. */
    return 0;

err:
    fus_runner_dump_error(runner);
    return -1;
}

